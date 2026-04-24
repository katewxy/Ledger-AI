import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const mediaType = file.type as "image/jpeg" | "image/png" | "image/gif" | "image/webp";

    const msg = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: base64,
              },
            },
            {
              type: "text",
              text: 'Extract the merchant name, total amount, and date from this receipt. Return only valid JSON: {"merchant": string, "amount": number, "date": string, "currency": string} where currency is USD or CNY based on the receipt. No other text.',
            },
          ],
        },
      ],
    });

    const raw = msg.content[0].type === "text" ? msg.content[0].text : "{}";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Could not extract receipt data from image");
    }

    const data = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ data });
  } catch (err) {
    console.error("[upload-receipt]", err);
    return NextResponse.json(
      { error: "Receipt extraction failed", detail: String(err) },
      { status: 500 }
    );
  }
}
