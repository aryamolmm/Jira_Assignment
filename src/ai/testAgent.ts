import { groq, GROQ_MODEL } from "./groqClient.ts";

/**
 * Playwright Test Generation Agent
 * 
 * Converts Gherkin scenarios into Playwright TypeScript test scripts.
 */
export async function generateTest(gherkin: string): Promise<{ test_code: string }> {
  const systemPrompt = `
You are an expert QA automation engineer using Playwright.
Your task is to convert manual test cases into robust, executable Playwright automation scripts.

---------------------------------------
INSTRUCTIONS
---------------------------------------

1. APPLICATION HANDLING
- Dynamically explore the UI (do NOT assume any fixed selectors)
- Identify elements based on:
  - Accessible roles (getByRole)
  - Labels (getByLabel)
  - Visible text (getByText)
  - Placeholder text
  - data-testid (if available)

2. LOCATOR STRATEGY
- Always prefer stable selectors:
  - getByRole > getByLabel > getByText
- Avoid brittle XPath unless absolutely necessary

3. ACTION MAPPING
Convert steps into Playwright actions:
- "Enter / Input" → page.fill()
- "Click" → page.click()
- "Select" → page.selectOption()
- "Navigate" → page.goto()

4. ASSERTIONS
- Convert expected results into assertions using expect()

5. CODE QUALITY
- Generate clean, readable TypeScript code
- Add meaningful comments for locator choices

---------------------------------------
OUTPUT FORMAT
---------------------------------------

Generate:
- A complete Playwright test script (TypeScript)
- Return ONLY valid JSON in this format: { "test_code": "..." }
- No explanations, no markdown blocks.

---------------------------------------
IMPORTANT RULES
---------------------------------------
- DO NOT assume the application is SauceDemo unless specified.
- DO NOT use hardcoded selectors.
- ALWAYS rely on UI exploration techniques.
  `;

  const userPrompt = `Gherkin scenarios:\n\n${gherkin}`;

  try {
    const response = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      model: GROQ_MODEL,
      temperature: 0.1,
      response_format: { type: "json_object" }
    });

    const content = response.choices[0]?.message?.content || '{"test_code": ""}';
    return JSON.parse(content);
  } catch (error: any) {
    console.error(`❌ Test Agent Error: ${error.message}`);
    throw error;
  }
}
