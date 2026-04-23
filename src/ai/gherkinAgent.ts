import { groq, GROQ_MODEL } from "./groqClient.ts";

/**
 * Gherkin Generation Agent
 * 
 * Converts a feature description into structured BDD testcases.
 */
export async function generateGherkin(featureDescription: string): Promise<{ gherkin: string }> {
  const systemPrompt = `
    You are a Gherkin Generation Agent.
    
    Your task:
    - Convert feature into structured BDD testcases (Feature: ... Scenario: ... Given When Then)
    - Cover main flow + edge cases
    
    Rules:
    - Use Given / When / Then format
    - Include at least 3 scenarios
    - Keep it realistic for automation
    - Return ONLY valid JSON in this format: { "gherkin": "..." }
    - No explanations, no markdown blocks.
  `;

  const userPrompt = `Feature description: ${featureDescription}`;

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

    const content = response.choices[0]?.message?.content || '{"gherkin": ""}';
    return JSON.parse(content);
  } catch (error: any) {
    console.error(`❌ Gherkin Agent Error: ${error.message}`);
    throw error;
  }
}
