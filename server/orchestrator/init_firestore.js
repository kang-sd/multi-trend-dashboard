#!/usr/bin/env node
// Firestore 초기화: 현재 bindings 상태를 전체 firestore 프로젝트에 강제 푸시
// 실행: node init_firestore.js [--project=career-aptitude-final]
// --project=X: 특정 firebase_project_id만 처리

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BINDINGS_PATH = path.join(__dirname, "project_model_bindings.json");
const STATUS_PATH   = path.join(__dirname, "model_status.json");

const args = process.argv.slice(2);
const projectFilter = (args.find(a => a.startsWith("--project=")) || "").split("=")[1] || null;

const status   = JSON.parse(fs.readFileSync(STATUS_PATH, "utf8"));
const bindings = JSON.parse(fs.readFileSync(BINDINGS_PATH, "utf8"));

function getModelActualId(registryId) {
  const m = (status.models || []).find(x => x.id === registryId);
  return m ? m.model : registryId;
}

async function pushFirestore(projectId, firebaseProjectId, binding) {
  let token;
  try {
    token = execSync("gcloud.cmd auth print-access-token 2>nul || gcloud auth print-access-token", { encoding: "utf8", timeout: 8000, shell: true }).trim();
  } catch {
    console.error(`  ❌ [${projectId}] gcloud 토큰 획득 실패 — gcloud auth login 필요`);
    return false;
  }

  const cerebrasModel = getModelActualId(binding.primary_model_id);
  const orModel       = getModelActualId(binding.fallback_model_ids[0]);
  const orModel2      = binding.fallback_model_ids[1] ? getModelActualId(binding.fallback_model_ids[1]) : null;

  const url = `https://firestore.googleapis.com/v1/projects/${firebaseProjectId}/databases/(default)/documents/orchestrator/model_config`;

  const fields = {
    cerebras_model: { stringValue: cerebrasModel },
    or_model:       { stringValue: orModel },
    updated_at:     { stringValue: new Date().toISOString() },
    updated_by:     { stringValue: "init_firestore.js" },
  };
  if (orModel2) fields.or_model_2 = { stringValue: orModel2 };

  console.log(`  📤 [${projectId}] → cerebras_model: ${cerebrasModel}`);
  console.log(`              or_model: ${orModel}${orModel2 ? `\n              or_model_2: ${orModel2}` : ""}`);

  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`  ❌ [${projectId}] PATCH 실패: ${res.status} — ${text.slice(0, 300)}`);
    return false;
  }
  console.log(`  ✅ [${projectId}] Firestore 갱신 완료\n`);
  return true;
}

async function main() {
  console.log("=== Firestore orchestrator/model_config 초기화 ===");
  console.log(`실행 시각: ${new Date().toLocaleString("ko-KR")}\n`);

  const targets = bindings.bindings.filter(b =>
    b.enabled &&
    b.patch_mode === "firestore" &&
    b.firebase_project_id &&
    (!projectFilter || b.firebase_project_id === projectFilter || b.project_id === projectFilter)
  );

  if (targets.length === 0) {
    console.log("처리할 프로젝트 없음");
    return;
  }

  let ok = 0, fail = 0;
  for (const b of targets) {
    const success = await pushFirestore(b.project_id, b.firebase_project_id, b);
    success ? ok++ : fail++;
  }

  console.log(`\n=== 완료: 성공 ${ok}개, 실패 ${fail}개 ===`);
}

main().catch(e => { console.error(e); process.exit(1); });
