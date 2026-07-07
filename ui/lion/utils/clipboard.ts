
export async function readClipboardText(): Promise<string> {
  try {
    if (navigator.clipboard && navigator.clipboard.readText) {
      return await navigator.clipboard.readText()
    }
    console.log("navigator.clipboard api not found")
    return ''
  } catch (err) {
    console.error('Failed to read clipboard:', err);
    return '';
  }
}
