#!/usr/bin/env node
// 죽은 모델 자동 감지 → 프로젝트별 교체 적용
// 실행: node auto_replace.js [--dry-run] [--project=career-final]
// --dry-run: 실제 변경 없이 변경 계획만 출력
// --project=X: 특정 프로젝트만 처리

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BINDINGS_PATH = path.join(__dirname, "project_model_bindings.json");
const STATUS_PATH   = path.join(__dirname, "model_status.json");
const CHANGELOG_PATH = path.join(__dirname, "change_log.json");

// ── CLI 인수 파싱 ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const projectFilter = (args.find(a => a.startsWith("--project=")) || "").split("=")[1] || null;

if (DRY_RUN) console.log("🔍 [DRY-RUN 모드] 실제 변경 없이 계획만 출력합니다.\n");

// ── 데이터 로드 ────────────────────────────────────────────────────────────────
const status   = JSON.parse(fs.readFileSync(STATUS_PATH, "utf8"));
const bindings = JSON.parse(fs.readFileSync(BINDINGS_PATH, "utf8"));

// 모델 상태 맵 구성
const modelStatusMap = {};
for (const m of (status.models || [])) {
  modelStatusMap[m.id] = m.status || "unknown";
}

function isLive(modelId) {
  const s = modelStatusMap[modelId] || "";
  return s.startsWith("✅");
}

function isDead(modelId) {
  if (!modelId || modelId === "none") return false;
  const s = modelStatusMap[modelId];
  if (!s) return true; // 등록되지 않은 모델 = 사실상 dead
  return s.startsWith("❌");
}

// 폴백 체인에서 첫 번째 live 모델 선택
const RECOMMENDED_FALLBACK = [
  "cerebras-llama31-8b",
  "or-gemini-flash-lite",
  "or-step-flash",
  "groq-llama31-8b",
  "or-gpt-oss-free",
];

function selectReplacement(binding) {
  for (const fb of binding.fallback_model_ids) {
    if (isLive(fb)) return fb;
  }
  for (const rec of RECOMMENDED_FALLBACK) {
    if (isLive(rec)) return rec;
  }
  return null;
}

// ── 변경 로그 로드/저장 ────────────────────────────────────────────────────────
function loadChangelog() {
  if (!fs.existsSync(CHANGELOG_PATH)) return { changes: [] };
  return JSON.parse(fs.readFileSync(CHANGELOG_PATH, "utf8"));
}

function appendChangelog(entry) {
  const log = loadChangelog();
  log.changes.push(entry);
  if (!DRY_RUN) fs.writeFileSync(CHANGELOG_PATH, JSON.stringify(log, null, 2), "utf8");
}

// ── Firestore REST 패치 ────────────────────────────────────────────────────────
// Firestore 문서 필드: cerebras_model / or_model / or_model_2
// (functions/index.js의 getModelConfig()가 읽는 실제 필드명)
async function patchFirestore(projectId, firebaseProjectId, binding) {
  let token;
  try {
    token = execSync("gcloud.cmd auth print-access-token 2>nul || gcloud auth print-access-token", { encoding: "utf8", timeout: 8000, shell: true }).trim();
  } catch {
    console.error(`  ❌ [${projectId}] gcloud 토큰 획득 실패 — gcloud auth login 필요`);
    return false;
  }

  const primary = getModelActualId(binding.primary_model_id);
  const fb0     = getModelActualId(binding.fallback_model_ids[0]);
  const fb1     = getModelActualId(binding.fallback_model_ids[1]);

  // Firestore document: orchestrator/model_config
  const url = `https://firestore.googleapis.com/v1/projects/${firebaseProjectId}/databases/(default)/documents/orchestrator/model_config`;

  const fields = {
    cerebras_model: { stringValue: primary },
    or_model:       { stringValue: fb0 },
    updated_at:     { stringValue: new Date().toISOString() },
    updated_by:     { stringValue: "auto_replace.js" },
  };
  // or_model_2는 3번째 폴백이 있는 프로젝트에만 추가 (예: career-final)
  if (fb1) fields.or_model_2 = { stringValue: fb1 };

  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ fields }),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`  ❌ [${projectId}] Firestore PATCH 실패: ${res.status} ${text.slice(0, 200)}`);
    return false;
  }
  console.log(`  📤 [${projectId}] Firestore 업데이트: cerebras_model=${primary}, or_model=${fb0}${fb1 ? `, or_model_2=${fb1}` : ""}`);
  return true;
}

// ── 파일 직접 교체 ─────────────────────────────────────────────────────────────
function getModelActualId(modelRegistryId) {
  const m = (status.models || []).find(x => x.id === modelRegistryId);
  return m ? m.model : modelRegistryId;
}

function patchFile(filePath, oldModelId, newModelId) {
  if (!fs.existsSync(filePath)) {
    console.error(`  ❌ 파일 없음: ${filePath}`);
    return false;
  }

  const oldModelStr = getModelActualId(oldModelId);
  const newModelStr = getModelActualId(newModelId);

  let content = fs.readFileSync(filePath, "utf8");
  const count = (content.match(new RegExp(oldModelStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;

  if (count === 0) {
    console.warn(`  ⚠️  파일 내 "${oldModelStr}" 문자열 없음 — 이미 교체됐거나 다른 형식`);
    return false;
  }

  content = content.replaceAll(oldModelStr, newModelStr);
  fs.writeFileSync(filePath, content, "utf8");
  console.log(`  ✅ 파일 수정 완료 (${count}곳): ${oldModelStr} → ${newModelStr}`);
  return true;
}

// ── n8n API 패치 ──────────────────────────────────────────────────────────────
async function patchN8n(binding, oldModelId, newModelId) {
  const N8N_BASE = process.env.N8N_BASE_URL || "http://localhost:5678";
  const N8N_KEY  = process.env.N8N_API_KEY  || "";

  if (!N8N_KEY) {
    console.warn(`  ⚠️  [${binding.project_id}] N8N_API_KEY 환경변수 없음 — 건너뜀`);
    return false;
  }

  const oldStr = getModelActualId(oldModelId);
  const newStr = getModelActualId(newModelId);
  const workflowIds = Object.values(binding.workflow_ids || {});

  let patchCount = 0;
  for (const wfId of workflowIds) {
    try {
      const getRes = await fetch(`${N8N_BASE}/api/v1/workflows/${wfId}`, {
        headers: { "X-N8N-API-KEY": N8N_KEY },
        signal: AbortSignal.timeout(8000),
      });
      if (!getRes.ok) { console.warn(`  ⚠️  워크플로우 ${wfId} 조회 실패`); continue; }

      let wfJson = await getRes.text();
      if (!wfJson.includes(oldStr)) { console.log(`  ℹ️  워크플로우 ${wfId} — 해당 모델 없음, 스킵`); continue; }

      const updated = wfJson.replaceAll(oldStr, newStr);
      const putRes = await fetch(`${N8N_BASE}/api/v1/workflows/${wfId}`, {
        method: "PUT",
        headers: { "X-N8N-API-KEY": N8N_KEY, "Content-Type": "application/json" },
        body: updated,
        signal: AbortSignal.timeout(8000),
      });
      if (putRes.ok) {
        console.log(`  ✅ n8n 워크플로우 ${wfId} 교체 완료`);
        patchCount++;
      } else {
        console.error(`  ❌ n8n 워크플로우 ${wfId} PUT 실패: ${putRes.status}`);
      }
    } catch (e) {
      console.error(`  ❌ n8n 워크플로우 ${wfId} 오류: ${e.message}`);
    }
  }
  return patchCount > 0;
}

// ── 바인딩 처리 ────────────────────────────────────────────────────────────────
async function processBinding(binding) {
  if (!binding.enabled) return;
  if (binding.apply_mode !== "auto") return;
  if (projectFilter && binding.project_id !== projectFilter) return;

  const { project_id, primary_model_id, fallback_model_ids, patch_mode, firebase_project_id, target_location } = binding;

  const deadPrimary   = isDead(primary_model_id);
  const deadFallbacks = fallback_model_ids.filter(isDead);
  const hasIssue      = deadPrimary || deadFallbacks.length > 0;

  if (!hasIssue) {
    console.log(`  ✅ [${project_id}] 정상 — 교체 불필요`);
    return;
  }

  console.log(`\n🔄 [${project_id}]`);
  if (deadPrimary)   console.log(`  ❌ primary "${primary_model_id}" dead`);
  if (deadFallbacks.length) console.log(`  ⚠️  fallback dead: ${deadFallbacks.join(", ")}`);

  if (patch_mode === "manual_log") {
    const replacement = deadPrimary ? selectReplacement(binding) : null;
    console.log(`  📋 [manual_log] 자동 적용 불가 (${binding.target_type}). 수동 조치 필요:`);
    if (deadPrimary) console.log(`     → primary 교체 제안: "${primary_model_id}" → "${replacement || 'N/A'}"`);
    deadFallbacks.forEach(fb => console.log(`     → fallback 교체 필요: "${fb}"`));
    appendChangelog({
      ts: new Date().toISOString(), project: project_id, action: "manual_log_required",
      dead_primary: deadPrimary ? primary_model_id : null,
      dead_fallbacks: deadFallbacks, suggested_replacement: replacement,
    });
    return;
  }

  // primary 교체 처리
  if (deadPrimary) {
    const replacement = selectReplacement(binding);
    if (!replacement) {
      console.error(`  ❌ [${project_id}] 대체 모델 없음 — 건너뜀`);
      return;
    }

    console.log(`  → 교체: "${primary_model_id}" → "${replacement}"`);

    if (DRY_RUN) {
      console.log(`  [DRY-RUN] 실제 변경하지 않음`);
      return;
    }

    let applied = false;

    if (patch_mode === "firestore" && firebase_project_id) {
      // 임시로 binding의 primary를 교체 후 Firestore에 전체 상태를 씀
      const prevPrimary = binding.primary_model_id;
      binding.primary_model_id = replacement;
      applied = await patchFirestore(project_id, firebase_project_id, binding);
      if (!applied) binding.primary_model_id = prevPrimary; // 실패 시 롤백

    } else if (patch_mode === "file_edit" && target_location && !target_location.startsWith("Google")) {
      applied = patchFile(target_location, primary_model_id, replacement);

    } else if (patch_mode === "n8n_api") {
      applied = await patchN8n(binding, primary_model_id, replacement);
    }

    if (applied) {
      // firestore 모드는 patchFirestore 내부에서 이미 갱신됨; 나머지 모드는 여기서 갱신
      if (patch_mode !== "firestore") binding.primary_model_id = replacement;
      appendChangelog({
        ts: new Date().toISOString(), project: project_id, action: "replaced",
        patch_mode, old_model: primary_model_id, new_model: replacement,
      });
      console.log(`  ✅ [${project_id}] 교체 완료`);
    }
  }

  // fallback 죽은 항목 정리 (live 모델로 교체)
  let fallbackChanged = false;
  for (let i = 0; i < binding.fallback_model_ids.length; i++) {
    if (isDead(binding.fallback_model_ids[i])) {
      const liveAlt = RECOMMENDED_FALLBACK.find(r => isLive(r) && !binding.fallback_model_ids.includes(r));
      if (liveAlt) {
        console.log(`  → fallback[${i}] 교체: "${binding.fallback_model_ids[i]}" → "${liveAlt}"`);
        if (!DRY_RUN) {
          binding.fallback_model_ids[i] = liveAlt;
          fallbackChanged = true;
        }
      }
    }
  }

  if (fallbackChanged) {
    appendChangelog({
      ts: new Date().toISOString(), project: project_id, action: "fallback_updated",
      patch_mode, updated_fallbacks: binding.fallback_model_ids,
    });
  }
}

// ── 메인 ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== AI 모델 자동 교체 오케스트레이터 ===");
  console.log(`실행 시각: ${new Date().toLocaleString("ko-KR")}\n`);
  console.log("── 모델 상태 요약 ──");

  const dead  = (status.models || []).filter(m => m.status?.startsWith("❌")).map(m => m.id);
  const live  = (status.models || []).filter(m => m.status?.startsWith("✅")).map(m => m.id);
  console.log(`  ✅ live  : ${live.length}개  [${live.join(", ")}]`);
  console.log(`  ❌ dead  : ${dead.length}개  [${dead.join(", ")}]\n`);

  console.log("── 프로젝트별 처리 ──");
  for (const binding of bindings.bindings) {
    await processBinding(binding);
  }

  // 변경된 bindings JSON 저장
  if (!DRY_RUN) {
    bindings.updated_at = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(BINDINGS_PATH, JSON.stringify(bindings, null, 2), "utf8");
    console.log("\n✅ project_model_bindings.json 갱신 완료");
  }

  console.log("\n=== 완료 ===");
  if (DRY_RUN) console.log("(dry-run — 실제 변경 없음)");
  else          console.log(`변경 이력: ${CHANGELOG_PATH}`);
}

main().catch(e => { console.error(e); process.exit(1); });
