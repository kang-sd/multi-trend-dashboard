#!/usr/bin/env node
// 제공사별 무료 AI 모델 목록 자동 수집 → model_status.json + api_vault.json 갱신
// 실행: node fetch_free_models.js
// 실행(특정 제공사만): node fetch_free_models.js --provider groq,cerebras

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const STATUS_PATH = path.join(__dirname, "model_status.json");

const KEYS = {
  OPENROUTER:  process.env.OPENROUTER_API_KEY,
  GROQ:        process.env.GROQ_API_KEY,
  CEREBRAS:    process.env.CEREBRAS_API_KEY,
  HF:          process.env.HF_TOKEN,
  GEMINI:      process.env.GEMINI_API_KEY,
  CHUTES:      process.env.CHUTES_API_KEY,
  HYPERBOLIC:  process.env.HYPERBOLIC_API_KEY,
  COHERE:      process.env.COHERE_API_KEY,
  SAMBANOVA:   process.env.SAMBANOVA_API_KEY,
  DEEPSEEK:    process.env.DEEPSEEK_API_KEY,
};

// CLI --provider 필터
const args = process.argv.slice(2);
const providerFlag = args.find(a => a.startsWith("--provider=") || a.startsWith("--provider "));
const filterProviders = providerFlag
  ? (providerFlag.split("=")[1] || args[args.indexOf(providerFlag) + 1] || "").split(",").map(s => s.trim().toLowerCase())
  : null;

const results = {}; // provider → [{id, name, context_length, ...}]

// ── 헬퍼 ──────────────────────────────────────────────────────────────────────

async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000), ...opts });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res.json();
}

function log(provider, msg) {
  console.log(`[${provider.padEnd(12)}] ${msg}`);
}

function shouldRun(provider) {
  return !filterProviders || filterProviders.includes(provider.toLowerCase());
}

// ── 제공사별 수집 함수 ─────────────────────────────────────────────────────────

async function fetchOpenRouter() {
  if (!shouldRun("openrouter")) return;
  if (!KEYS.OPENROUTER) { log("OpenRouter", "키 없음 — 스킵"); return; }
  try {
    const data = await fetchJSON("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${KEYS.OPENROUTER}` }
    });
    const free = (data.data || []).filter(m => m.id.endsWith(":free"));
    results.openrouter = free.map(m => ({
      id: m.id,
      name: m.name || m.id,
      context_length: m.context_length,
      provider: "OpenRouter"
    }));
    log("OpenRouter", `✅ 무료 모델 ${free.length}개`);
  } catch (e) {
    log("OpenRouter", `❌ ${e.message}`);
    results.openrouter = [];
  }
}

async function fetchGroq() {
  if (!shouldRun("groq")) return;
  if (!KEYS.GROQ) { log("Groq", "키 없음 — 스킵"); return; }
  try {
    const data = await fetchJSON("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${KEYS.GROQ}` }
    });
    const models = (data.data || []).filter(m => m.active !== false);
    results.groq = models.map(m => ({
      id: m.id,
      name: m.id,
      context_length: m.context_window,
      provider: "Groq"
    }));
    log("Groq", `✅ 모델 ${models.length}개 (전체 무료)`);
  } catch (e) {
    log("Groq", `❌ ${e.message}`);
    results.groq = [];
  }
}

async function fetchCerebras() {
  if (!shouldRun("cerebras")) return;
  if (!KEYS.CEREBRAS) { log("Cerebras", "키 없음 — 스킵"); return; }
  try {
    const data = await fetchJSON("https://api.cerebras.ai/v1/models", {
      headers: { Authorization: `Bearer ${KEYS.CEREBRAS}` }
    });
    const models = data.data || [];
    results.cerebras = models.map(m => ({
      id: m.id,
      name: m.id,
      context_length: m.context_window,
      provider: "Cerebras"
    }));
    log("Cerebras", `✅ 모델 ${models.length}개 (전체 무료)`);
  } catch (e) {
    log("Cerebras", `❌ ${e.message}`);
    results.cerebras = [];
  }
}

async function fetchHuggingFace() {
  if (!shouldRun("huggingface")) return;
  if (!KEYS.HF) { log("HuggingFace", "키 없음 — 스킵"); return; }
  try {
    const data = await fetchJSON("https://router.huggingface.co/v1/models", {
      headers: { Authorization: `Bearer ${KEYS.HF}` }
    });
    const models = data.data || [];
    results.huggingface = models.map(m => ({
      id: m.id,
      name: m.id,
      context_length: m.context_length || null,
      provider: "HuggingFace"
    }));
    log("HuggingFace", `✅ 모델 ${models.length}개`);
  } catch (e) {
    log("HuggingFace", `❌ ${e.message}`);
    results.huggingface = [];
  }
}

async function fetchGemini() {
  if (!shouldRun("gemini")) return;
  if (!KEYS.GEMINI) { log("Gemini", "키 없음 — 스킵"); return; }
  try {
    const data = await fetchJSON(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${KEYS.GEMINI}`
    );
    const models = (data.models || []).filter(m =>
      m.supportedGenerationMethods?.includes("generateContent")
    );
    results.gemini = models.map(m => ({
      id: m.name.replace("models/", ""),
      name: m.displayName || m.name,
      context_length: m.inputTokenLimit,
      provider: "Gemini"
    }));
    log("Gemini", `✅ 모델 ${models.length}개 (무료 쿼터 내)`);
  } catch (e) {
    log("Gemini", `❌ ${e.message}`);
    results.gemini = [];
  }
}

async function fetchChutes() {
  if (!shouldRun("chutes")) return;
  if (!KEYS.CHUTES) { log("Chutes", "키 없음 — 스킵"); return; }
  try {
    const data = await fetchJSON("https://llm.chutes.ai/v1/models", {
      headers: { Authorization: `Bearer ${KEYS.CHUTES}` }
    });
    const models = data.data || [];
    results.chutes = models.map(m => ({
      id: m.id,
      name: m.id,
      context_length: m.context_length || null,
      provider: "Chutes"
    }));
    log("Chutes", `✅ 모델 ${models.length}개 (전체 무료)`);
  } catch (e) {
    log("Chutes", `❌ ${e.message}`);
    results.chutes = [];
  }
}

async function fetchHyperbolic() {
  if (!shouldRun("hyperbolic")) return;
  if (!KEYS.HYPERBOLIC) { log("Hyperbolic", "키 없음 — 스킵"); return; }
  try {
    const data = await fetchJSON("https://api.hyperbolic.xyz/v1/models", {
      headers: { Authorization: `Bearer ${KEYS.HYPERBOLIC}` }
    });
    const models = data.data || [];
    results.hyperbolic = models.map(m => ({
      id: m.id,
      name: m.id,
      context_length: m.context_length || null,
      provider: "Hyperbolic"
    }));
    log("Hyperbolic", `✅ 모델 ${models.length}개`);
  } catch (e) {
    log("Hyperbolic", `❌ ${e.message}`);
    results.hyperbolic = [];
  }
}

async function fetchCohere() {
  if (!shouldRun("cohere")) return;
  if (!KEYS.COHERE) { log("Cohere", "키 없음 — 스킵"); return; }
  try {
    const data = await fetchJSON("https://api.cohere.com/v1/models", {
      headers: { Authorization: `Bearer ${KEYS.COHERE}` }
    });
    const models = (data.models || []).filter(m =>
      m.endpoints?.includes("chat") || m.endpoints?.includes("generate")
    );
    results.cohere = models.map(m => ({
      id: m.name,
      name: m.name,
      context_length: m.context_length,
      provider: "Cohere"
    }));
    log("Cohere", `✅ 모델 ${models.length}개`);
  } catch (e) {
    log("Cohere", `❌ ${e.message}`);
    results.cohere = [];
  }
}

async function fetchSambaNova() {
  if (!shouldRun("sambanova")) return;
  if (!KEYS.SAMBANOVA) { log("SambaNova", "키 없음 — 스킵"); return; }
  try {
    const data = await fetchJSON("https://api.sambanova.ai/v1/models", {
      headers: { Authorization: `Bearer ${KEYS.SAMBANOVA}` }
    });
    const models = data.data || [];
    results.sambanova = models.map(m => ({
      id: m.id,
      name: m.id,
      context_length: m.context_window || null,
      provider: "SambaNova"
    }));
    log("SambaNova", `✅ 모델 ${models.length}개`);
  } catch (e) {
    log("SambaNova", `❌ ${e.message}`);
    results.sambanova = [];
  }
}

async function fetchDeepSeek() {
  if (!shouldRun("deepseek")) return;
  if (!KEYS.DEEPSEEK) { log("DeepSeek", "키 없음 — 스킵"); return; }
  try {
    const data = await fetchJSON("https://api.deepseek.com/models", {
      headers: { Authorization: `Bearer ${KEYS.DEEPSEEK}` }
    });
    const models = data.data || [];
    results.deepseek = models.map(m => ({
      id: m.id,
      name: m.id,
      context_length: m.context_length || null,
      provider: "DeepSeek"
    }));
    log("DeepSeek", `✅ 모델 ${models.length}개`);
  } catch (e) {
    log("DeepSeek", `❌ ${e.message}`);
    results.deepseek = [];
  }
}

async function fetchCloudflare() {
  if (!shouldRun("cloudflare")) return;
  try {
    // wrangler를 통해 계정 ID 확인 후 API 호출
    const { execSync } = await import("child_process");
    let accountId = null;
    try {
      const whoami = execSync("npx wrangler whoami --json 2>/dev/null", { encoding: "utf8", timeout: 10000 });
      const parsed = JSON.parse(whoami);
      accountId = parsed?.memberships?.[0]?.account?.id;
    } catch { /* wrangler 없거나 미인증 */ }

    if (!accountId) {
      log("Cloudflare", "계정 ID 조회 실패 — wrangler 로그인 필요");
      results.cloudflare = [];
      return;
    }

    const data = await fetchJSON(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/models/search?per_page=500`,
      { headers: { "Content-Type": "application/json" } }
    );
    const models = data.result || [];
    results.cloudflare = models.map(m => ({
      id: m.name,
      name: m.description || m.name,
      context_length: null,
      provider: "Cloudflare"
    }));
    log("Cloudflare", `✅ 모델 ${models.length}개 (Workers AI 무료 플랜)`);
  } catch (e) {
    log("Cloudflare", `❌ ${e.message}`);
    results.cloudflare = [];
  }
}

async function fetchOllama() {
  if (!shouldRun("ollama")) return;
  try {
    const data = await fetchJSON("http://localhost:11434/api/tags");
    const models = data.models || [];
    results.ollama = models.map(m => ({
      id: m.name,
      name: m.name,
      context_length: null,
      provider: "Ollama (local)"
    }));
    log("Ollama", `✅ 로컬 모델 ${models.length}개`);
  } catch (e) {
    log("Ollama", `⚠️ 로컬 서버 미실행 (${e.message})`);
    results.ollama = [];
  }
}

// ── 저장 ──────────────────────────────────────────────────────────────────────

function saveResults() {
  const now = new Date().toISOString().slice(0, 10);

  // 1. model_status.json 의 free_models 섹션 갱신
  const status = JSON.parse(fs.readFileSync(STATUS_PATH, "utf8"));
  status.free_models_by_provider = {};
  for (const [provider, models] of Object.entries(results)) {
    status.free_models_by_provider[provider] = models;
  }
  status._meta.last_checked = now;
  status._meta.free_models_updated = now;
  fs.writeFileSync(STATUS_PATH, JSON.stringify(status, null, 2), "utf8");
  console.log(`\n✅ model_status.json 갱신 완료`);

  if (results.openrouter && results.openrouter.length > 0) {
    console.log(`✅ OpenRouter 무료 모델 ${results.openrouter.length}개 수집 완료`);
  }

  // 3. 요약 출력
  console.log("\n═══════════════════════════════════════");
  console.log("  제공사별 무료 모델 현황");
  console.log("═══════════════════════════════════════");
  for (const [provider, models] of Object.entries(results)) {
    console.log(`  ${provider.padEnd(14)} : ${models.length}개`);
  }
  const total = Object.values(results).reduce((s, m) => s + m.length, 0);
  console.log("───────────────────────────────────────");
  console.log(`  합계           : ${total}개`);
  console.log("═══════════════════════════════════════\n");
}

// ── 메인 ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== 무료 AI 모델 수집 시작 ===\n");

  await Promise.allSettled([
    fetchOpenRouter(),
    fetchGroq(),
    fetchCerebras(),
    fetchHuggingFace(),
    fetchGemini(),
    fetchChutes(),
    fetchHyperbolic(),
    fetchCohere(),
    fetchSambaNova(),
    fetchDeepSeek(),
    fetchCloudflare(),
    fetchOllama(),
  ]);

  saveResults();
}

main().catch(e => { console.error(e); process.exit(1); });
