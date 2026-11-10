// Dev tool: run the full analysis (HTTP -> browser -> AI) on live URLs and print the result.
// Usage: npm run probe -- <url> [<url> ...]
import { analyzeUrl } from "@/core/pipeline";
import { geminiClient } from "@/core/ai/gemini";
import { closeBrowser } from "@/core/fetch";

async function main() {
  for (const url of process.argv.slice(2)) {
    const result = await analyzeUrl(url, { llm: geminiClient() });
    console.log(JSON.stringify(result, null, 2));
  }
  await closeBrowser();
}
main().catch(async (e) => {
  console.error("ERROR", e.message);
  await closeBrowser();
});
