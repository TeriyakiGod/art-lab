import { AIChatAgent } from "@cloudflare/ai-chat";
import { createAI, type CloudflareLanguageModelId } from "agents/models/ai-sdk";
import { convertToModelMessages, isStepCount, streamText, tool } from "ai";
import { z } from "zod";
import { CHAT_MODELS, DEFAULT_CHAT_MODEL, modelSees, type ChatBody } from "../shared/types";
import { LOOK_TOOL, liftImages } from "../shared/chatImages";
import { LESSONS, searchLessons } from "../shared/lessons";

const SYSTEM = `You are the studio assistant in "Art Lab", a personal algorithmic art lab.
The user is a beginner at generative art. Be a patient, encouraging teacher:
explain ideas in plain words, keep answers short, and prefer small steps over big rewrites.

## How sketches work here
Sketches are browser JavaScript modules that run in a sandboxed iframe and follow GenArtAPI:
\`\`\`js
await $genart.waitForAdapter();
const param = await $genart.setParams({
  count: $genart.params.range({ name: "Count", desc: "How many shapes", min: 10, max: 2000, step: 10, default: 300 }),
  ink: $genart.params.color({ name: "Ink", desc: "Stroke color", default: "#f4efe6" }),
  mode: $genart.params.choice({ name: "Mode", desc: "Shape type", options: ["circles", "squares"], default: "circles" }),
  fill: $genart.params.toggle({ name: "Fill", desc: "Fill shapes", default: false }),
});
const { ctx, width, height } = lab.canvas();   // 2D context, already scaled for pixel density
const rnd = $genart.random.rnd;                // seeded random in [0, 1)
// draw with param("count"), param("ink"), ...
// optional animation: $genart.setUpdate((timeMs, frame) => { ...; return true; });
\`\`\`
Helpers on the global \`lab\` object: lab.canvas(), lab.noise2D(x, y), lab.noise3D(x, y, z) (seeded simplex noise in [-1, 1]),
lab.random(min, max), lab.pick(array), lab.gaussian(mean = 0, sd = 1), lab.map(v, inMin, inMax, outMin, outMax),
lab.palette(fallbackColors?) (array of hex colors the user picked in the Palette panel, else the fallback; colors[0] is usually the background).
Prefer lab.palette() over hard-coded colors when a sketch needs several colors, so the user can swap palettes.
Rules: NEVER use Math.random() (it breaks seeds); always use $genart.random.rnd or lab helpers.
No network access, no imports of external URLs, no DOM outside the canvas.
Expose interesting numbers and colors as params so the user can tweak them.

## p5.js sketches
A sketch's engine is either "canvas" (the style above) or "p5". For p5 sketches write p5.js v2 global-mode code:
keep the GenArtAPI block at the top (await $genart.waitForAdapter(); const param = await $genart.setParams({...})),
then define function setup() { createCanvas(lab.width, lab.height); ... } and function draw() { ... }.
p5's random() and noise() are seeded for you; never use Math.random(). Use noLoop() in setup() for still images.
Don't call lab.canvas() in p5 sketches; lab.palette() and params work the same.
Match the current sketch's engine unless the user asks to switch.

## Tools
- propose_edit: to change or create code, call it with the COMPLETE new sketch source and a one-line summary.
  The user reviews a diff and accepts or rejects it. Never paste whole sketches in chat instead.
- create_sketch: for a brand-new sketch from a description, keeping the current one. Write a complete, working sketch.
- set_params: to try new parameter values without changing code.
- search_lessons: find the relevant part of the built-in course, then point the user to it by lesson title.

Available lessons: ${LESSONS.map((l) => `${l.id} "${l.title}"`).join(", ")}.`;

export class ChatAgent extends AIChatAgent<Env> {
  maxPersistedMessages = 200;

  async onChatMessage(_onFinish: unknown, options?: { body?: Record<string, unknown>; abortSignal?: AbortSignal }) {
    const body = (options?.body ?? {}) as ChatBody;
    const modelId = CHAT_MODELS.some((m) => m.id === body.model) ? body.model! : DEFAULT_CHAT_MODEL;
    const ai = createAI({ binding: this.env.AI, ...(this.env.AI_GATEWAY_ID ? { id: this.env.AI_GATEWAY_ID } : {}) });

    let context = "";
    if (body.sketch) {
      context += `\n\n## Current sketch "${body.sketch.title}" (engine ${body.sketch.engine === "p5" ? "p5" : "canvas"}, seed ${body.sketch.seed})\n\`\`\`js\n${body.sketch.code.slice(0, 20_000)}\n\`\`\`\nCurrent param values: ${JSON.stringify(body.sketch.values).slice(0, 2000)}`;
    }
    if (body.errors?.length) context += `\n\nRecent sketch errors:\n${body.errors.slice(-5).join("\n").slice(0, 2000)}`;
    if (body.lessonId) context += `\n\nThe user is currently reading lesson ${body.lessonId}.`;
    if (body.generate) {
      context += "\n\nThe user just created this sketch from the description in their message; its code is only a placeholder. "
        + "Write a complete, working sketch for the idea from scratch (canvas unless they ask for p5), with 3-6 well-chosen params and seeded randomness, "
        + "and call propose_edit with it: it is applied automatically. Then say in two or three sentences what it does and which sliders to try first.";
    }
    const vision = modelSees(modelId);
    context += vision
      ? `\n\nYou can see the canvas: call ${LOOK_TOOL} when the user asks how the sketch looks, or to check your change after the user accepts it. Describe what you actually see.`
      : "\n\nYou can't see the canvas with this model. If the user asks how something looks, say so and suggest switching to the Balanced model, which can.";

    const result = streamText({
      model: ai(modelId as CloudflareLanguageModelId, modelId === DEFAULT_CHAT_MODEL ? {} : { fallback: [DEFAULT_CHAT_MODEL] }),
      system: SYSTEM + context,
      messages: liftImages(await convertToModelMessages(this.messages), vision),
      abortSignal: options?.abortSignal,
      tools: {
        propose_edit: tool({
          description: "Propose a new version of the whole sketch. The user sees a diff and accepts or rejects it.",
          inputSchema: z.object({
            summary: z.string().describe("One line describing the change"),
            code: z.string().describe("The complete new sketch source"),
            engine: z.enum(["canvas", "p5"]).optional().describe("Only when switching what the code is written for"),
          }),
        }),
        create_sketch: tool({
          description: "Create a separate new sketch (the current one is untouched). Use it when the user asks for a new or different sketch.",
          inputSchema: z.object({
            title: z.string().describe("Short title"),
            code: z.string().describe("The complete sketch source"),
            engine: z.enum(["canvas", "p5"]).optional().describe("Defaults to canvas"),
          }),
        }),
        set_params: tool({
          description: "Set parameter values on the current sketch (keys are param ids).",
          inputSchema: z.object({ values: z.record(z.string(), z.unknown()) }),
        }),
        search_lessons: tool({
          description: "Search the built-in generative art course for explanations and examples.",
          inputSchema: z.object({ query: z.string() }),
          execute: async ({ query }) => searchLessons(query),
        }),
        // Runs in the browser, which replies with { image: dataUrl } (see liftImages).
        ...(vision ? {
          [LOOK_TOOL]: tool({
            description: "Take a snapshot of the sketch as it is currently drawn, to see what it looks like.",
            inputSchema: z.object({}),
          }),
        } : {}),
      },
      stopWhen: isStepCount(6),
    });

    return result.toUIMessageStreamResponse();
  }
}
