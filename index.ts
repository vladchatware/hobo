import { serve, file, $ } from 'bun'
import { openai } from '@ai-sdk/openai';
import { createOllama } from 'ollama-ai-provider';
import { experimental_createMCPClient, streamText } from 'ai';
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import * as readline from 'node:readline/promises';

const ollama = createOllama({
  baseURL: 'http://100.101.237.13:11434/api'
})

const terminal = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const messages: any[] = [];

if (!(await file('credentials.json').exists())) {
  const server = serve({
    routes: {
      '/': {
        async GET(req) {
          server.stop(false)
          main().catch(console.error)
          return new Response()
        }
      }
    }
  })
  await $`open ${server.url}`
}

const main = async () => {
  // const notion = await experimental_createMCPClient({
  //   transport: {
  //     type: 'sse',
  //     url: 'https://mcp.notion.com/sse',
  //     headers: {
  //       Authorization: `Bearer 235d872b-594c-814d-8717-000273c709e5:n3ZE4RnOy1bTF7Wu:SgTRtK1rVGCawx37sNwXhcwPC0NMl4F9`
  //     }
  //   }
  // })
  while (true) {
    const userInput = await terminal.question('You: ');

    messages.push({ role: 'user', content: userInput });

    // const tools = await notion.tools()

    const result = streamText({
      model: ollama('llama3'),
      messages,
      // tools,
      maxSteps: 5
    });

    let fullResponse = '';
    process.stdout.write('Assistant: ');
    for await (const delta of result.textStream) {
      fullResponse += delta;
      process.stdout.write(delta);
    }
    process.stdout.write('\n');

    messages.push({ role: 'assistant', content: fullResponse });
  }
}

