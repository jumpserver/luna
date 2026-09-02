export function responseSucceeded(status) {
  return Number.isInteger(status) && status >= 200 && status < 300;
}
