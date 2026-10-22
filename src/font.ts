/** Canvas text is cached at creation. Load the inline face before the first canvas draws text. */
export async function loadPixelFont(): Promise<void> {
  try { await document.fonts.load('16px "Bincov Text"', '滨科夫水产站'); }
  catch { /* The system stack remains readable when a browser rejects embedded fonts. */ }
}
