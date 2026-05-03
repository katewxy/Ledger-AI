
import { createClient } from "@supabase/supabase-js";
import type { ClassifyResult } from "@/types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 查缓存：传入描述，返回缓存结果或 null
export async function getCached(description: string): Promise<ClassifyResult | null> {
  try {
    const { data, error } = await supabase
      .from("classification_cache")
      .select("category_en, category_zh, confidence")
      .eq("description", description.trim())
      .single();

    if (error || !data) return null;

    console.log(`[cache] HIT: "${description}" → ${data.category_en}`);
    return {
      category_en: data.category_en,
      category_zh: data.category_zh,
      confidence: 1.0, //cache hit永远1.0
    };
  } catch {
    return null;
  }
}

// 写缓存：把分类结果存进去
export async function setCached(
  description: string,
  result: ClassifyResult,
  source: "rule" | "llm"
): Promise<void> {
  try {
    const { error } = await supabase
      .from("classification_cache")
      .upsert(
        {
          description: description.trim(),
          category_en: result.category_en,
          category_zh: result.category_zh,
          confidence: source === "rule" ? 1.0 : result.confidence,
          source,
        },
        { onConflict: "description" }
      );

    if (error) {
      console.warn(`[cache] Write failed for "${description}":`, error.message);
    } else {
      console.log(`[cache] STORED (${source}): "${description}" → ${result.category_en}`);
    }
  } catch (err) {
    console.warn(`[cache] Unexpected error:`, err);
  }
}