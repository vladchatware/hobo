import { serve, file, write, $ } from 'bun'
import { openai } from '@ai-sdk/openai';
import { experimental_createMCPClient, streamText } from 'ai';
import * as readline from 'node:readline/promises';

const terminal = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const messages: any[] = [];

const main = async (token: string) => {
  const notion = await experimental_createMCPClient({
    transport: {
      type: 'sse',
      url: 'https://mcp.notion.com/sse',
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  })
  const tools = await notion.tools()
  while (true) {
    const userInput = await terminal.question('You: ');

    messages.push({ role: 'user', content: userInput });

    const result = streamText({
      model: openai('gpt-4o-mini'),
      messages,
      tools,
      maxSteps: 5
    });

    for await (const chunk of result.fullStream) {
      if (chunk.type === 'step-start') {
        process.stdout.write('Assistant: ')
      }

      if (chunk.type === 'step-finish') {
        process.stdout.write('\n')
      }

      if (chunk.type === 'text-delta') {
        process.stdout.write(chunk.textDelta);
      }

      if (chunk.type === 'tool-call') {
        process.stdout.write(`Calling ${chunk.toolName}: ${JSON.stringify(chunk.args)} `)
      }

      if (chunk.type === 'tool-result') {
        const content = JSON.parse((chunk.result.content as [{ text: string }])[0].text)
        if (chunk.result.isError) {
          console.log(content.message)
        } else {
          console.log(content) // TODO different format per tool
        }
      }
    }

    const respondedMessages = (await result.response).messages
    messages.push(...respondedMessages)
  }
}

if (!(await file('credentials.json').exists())) {
  const server = serve({
    routes: {
      '/auth/callback': {
        async GET(req) {
          const client = await file('client.json').json()
          const url = new URL(req.url)
          const code = url.searchParams.get('code')
          console.log(code)
          const params = new URLSearchParams()
          params.set('grant_type', 'authorization_code')
          params.set('code', `${code}`)
          params.set('redirect_uri', 'http://localhost:3000/auth/callback')
          params.set('client_id', client.client_id)
          params.set('client_secret', client.client_secret)
          const res = await fetch('https://mcp.notion.com/token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString()
          })
          const payload = await res.json()
          if (payload.error) {
            console.log(payload)
            return new Response()
          }
          await write('credentials.json', JSON.stringify(payload, null, 2))
          console.log(payload)
          server.stop(false)
          main(payload.access_token).catch(console.error)
          return new Response()
        }
      }
    }
  })
  const res1 = await fetch('https://mcp.notion.com/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      redirect_uris: ['http://localhost:3000/auth/callback'],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      client_name: 'Agent',
      client_uri: "https://vlad.chat"
    })
  })
  const client = await res1.json() as {
    client_id: "string",
    redirect_uris: string[],
    client_name: string,
    client_uri: string,
    grant_types: string[],
    response_types: string[]
    registration_client_uri: string,
    client_id_issued_at: number
  }
  console.log('client', client)
  await write('client.json', JSON.stringify(client, null, 2))
  const url = new URL('https://mcp.notion.com/authorize')
  const config = {
    response_type: 'code',
    client_id: client.client_id,
    redirect_uri: 'http://localhost:3000/auth/callback'
  }
  Object.entries(config).forEach((entry) => url.searchParams.set(entry[0], entry[1]))
  await $`open ${url}`
} else {
  const payload = await file('credentials.json').json()
  main(payload.access_token).catch(async (e) => {
    console.log(e)
    await file('credentials.json').delete()
  })
}

