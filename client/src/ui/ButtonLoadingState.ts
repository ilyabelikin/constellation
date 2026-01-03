/**
 * Utility functions for managing loading states on buttons
 * Provides consistent UX across all action buttons in the game
 */

// Store original button content for restoration
const originalButtonContent = new Map<HTMLButtonElement, string>();
const buttonTimeouts = new Map<HTMLButtonElement, number>();

/**
 * Set a button to loading state
 * - Disables the button
 * - Shows a spinner
 * - Preserves original content for later restoration
 * 
 * @param button - The button element to set loading
 * @param loadingText - Optional text to show next to spinner (default: "Loading...")
 * @param timeoutMs - Auto-restore after this many ms (default: 10000ms as safety)
 */
export function setButtonLoading(
  button: HTMLButtonElement | null,
  loadingText: string = "Loading...",
  timeoutMs: number = 10000
): void {
  if (!button) return;
  
  // Store original content if not already stored
  if (!originalButtonContent.has(button)) {
    originalButtonContent.set(button, button.innerHTML);
  }
  
  // Clear any existing timeout
  const existingTimeout = buttonTimeouts.get(button);
  if (existingTimeout) {
    window.clearTimeout(existingTimeout);
  }
  
  // Disable and show spinner
  button.disabled = true;
  button.innerHTML = `<span class="spinner"></span> ${loadingText}`;
  button.style.opacity = "0.7";
  button.style.cursor = "wait";
  
  // Safety timeout to restore button if server doesn't respond
  const timeout = window.setTimeout(() => {
    clearButtonLoading(button);
  }, timeoutMs);
  buttonTimeouts.set(button, timeout);
}

/**
 * Clear loading state and restore button to original state
 * 
 * @param button - The button element to restore
 */
export function clearButtonLoading(button: HTMLButtonElement | null): void {
  if (!button) return;
  
  // Clear timeout if any
  const timeout = buttonTimeouts.get(button);
  if (timeout) {
    window.clearTimeout(timeout);
    buttonTimeouts.delete(button);
  }
  
  // Restore original content
  const originalContent = originalButtonContent.get(button);
  if (originalContent !== undefined) {
    button.innerHTML = originalContent;
    originalButtonContent.delete(button);
  }
  
  // Re-enable button
  button.disabled = false;
  button.style.opacity = "";
  button.style.cursor = "";
}

/**
 * Check if a button is currently in loading state
 */
export function isButtonLoading(button: HTMLButtonElement | null): boolean {
  if (!button) return false;
  return originalButtonContent.has(button);
}

/**
 * Set button to temporary success state before returning to normal
 */
export function showButtonSuccess(
  button: HTMLButtonElement | null,
  successText: string = "✓ Done",
  durationMs: number = 1500
): void {
  if (!button) return;
  
  // Store original if needed
  if (!originalButtonContent.has(button)) {
    originalButtonContent.set(button, button.innerHTML);
  }
  
  // Show success
  button.innerHTML = successText;
  button.style.opacity = "";
  button.disabled = false;
  
  // Return to original after duration
  window.setTimeout(() => {
    clearButtonLoading(button);
  }, durationMs);
}

/**
 * Set button to temporary error state before returning to normal
 */
export function showButtonError(
  button: HTMLButtonElement | null,
  errorText: string = "✗ Error",
  durationMs: number = 2000
): void {
  if (!button) return;
  
  // Store original if needed
  if (!originalButtonContent.has(button)) {
    originalButtonContent.set(button, button.innerHTML);
  }
  
  // Show error
  button.innerHTML = errorText;
  button.style.opacity = "";
  button.style.color = "#ef4444";
  button.disabled = false;
  
  // Return to original after duration
  window.setTimeout(() => {
    button.style.color = "";
    clearButtonLoading(button);
  }, durationMs);
}

