import { fetchJiraIssue } from "./jira/jiraReader.ts";
import { generateGherkin } from "./ai/gherkinAgent.ts";
import { generateTest } from "./ai/testAgent.ts";
import { analyzeCoverage } from "./ai/coverageAgent.ts";
import { improveTest } from "./ai/improvementAgent.ts";
import { checkMemory } from "./ai/memoryAgent.ts";
import { saveMemory } from "./memory.ts";
import { saveTestFile, saveGherkin } from "./tools.ts";

async function runPipeline() {
  const input = process.argv[2];

  if (!input) {
    console.error("\n❌ Error: Missing input.");
    console.log("Usage: npx ts-node src/index.ts \"Some feature description\"");
    console.log("   OR: npx ts-node src/index.ts KAN-123");
    process.exit(1);
  }

  let featureDescription = input;

  // ── 1. Jira Integration (if input looks like a Jira ID) ──────────────────
  if (/^[A-Z]+-\d+$/.test(input)) {
    console.log(`\n📡 Fetching Jira ticket: ${input}...`);
    try {
      const issue = await fetchJiraIssue(input);
      featureDescription = `Summary: ${issue.summary}\nDescription: ${issue.description}`;
      console.log(`✅ Jira Data Retrieved: ${issue.summary}`);
    } catch (error: any) {
      console.error(`❌ Jira Error: ${error.message}`);
      process.exit(1);
    }
  }

  // ── 2. Memory Agent — check past executions before running full pipeline ──
  console.log("\n🧠 [Memory Agent] Checking past executions for similar input...");
  const memoryResult = await checkMemory(featureDescription);

  console.log("\n📋 Memory Agent Report:");
  console.log(JSON.stringify({
    used_memory: memoryResult.used_memory,
    similarity_score: memoryResult.similarity_score,
    reason: memoryResult.reason
  }, null, 2));

  if (memoryResult.used_memory && memoryResult.result) {
    // ── MEMORY HIT: reuse past outputs ──────────────────────────────────────
    console.log("\n♻️  [Memory Agent] Reusing past outputs (memory hit).");

    const { gherkin, testCode, coverage } = memoryResult.result;

    const gherkinPath = saveGherkin(gherkin);
    console.log(`✅ [Tool] Gherkin (from memory) saved to: ${gherkinPath}`);

    const testFile = saveTestFile(testCode);
    console.log(`✅ [Tool] Test script (from memory) saved to: ${testFile}`);

    console.log("\n--- COVERAGE REPORT (from memory) ---");
    console.log(coverage);
    console.log("--------------------------------------");

    console.log("\n✨ Jira QA Assistant: Pipeline completed using memory cache!");
    return;
  }

  // ── 3. Gherkin Agent ─────────────────────────────────────────────────────
  console.log("\n🤖 [Gherkin Agent] Generating BDD testcases...");
  const gherkinResult = await generateGherkin(featureDescription);
  const gherkin = gherkinResult.gherkin;
  const gherkinPath = saveGherkin(gherkin);
  console.log(`✅ [Tool] Gherkin saved to: ${gherkinPath}`);

  // ── 4. Test Agent ─────────────────────────────────────────────────────────
  console.log("\n🚀 [Test Agent] Translating Gherkin to Playwright...");
  const testResult = await generateTest(gherkin);
  const testCode = testResult.test_code;
  const testFile = saveTestFile(testCode);
  console.log(`✅ [Tool] Test script saved to: ${testFile}`);

  // ── 5. Coverage Agent ─────────────────────────────────────────────────────
  console.log("\n📊 [Coverage Agent] Analyzing scenario gaps...");
  const coverageResult = await analyzeCoverage(gherkin, testCode);
  const coverageStr = JSON.stringify(coverageResult, null, 2);
  console.log("\n--- COVERAGE REPORT ---");
  console.log(coverageStr);
  console.log("------------------------");

  let finalTestCode = testCode;

  // ── 6. Improvement Agent ──────────────────────────────────────────────────
  if (coverageResult.coverage_status === "incomplete") {
    console.log("\n🛠️  [Improvement Agent] Enhancing tests based on coverage gaps...");
    const improvementResult = await improveTest(gherkin, testCode, coverageResult.missing_cases);
    finalTestCode = improvementResult.improved_test_code;
    saveTestFile(finalTestCode);
    console.log(`✅ [Tool] Improved test script saved.`);
  }

  // ── 7. Memory Storage ─────────────────────────────────────────────────────
  console.log("\n🧠 Storing execution in memory...");
  saveMemory({
    input: featureDescription,
    gherkin,
    testCode: finalTestCode,
    coverage: coverageStr,
    timestamp: new Date().toISOString()
  });

  console.log("\n✨ Jira QA Assistant: Full pipeline successfully completed!");
}

runPipeline().catch((err) => {
  console.error("\n❌ Fatal Error in Jira QA Assistant:", err);
  process.exit(1);
});
