export interface GuacamoleDisplay {
  getWidth: () => number;
  getHeight: () => number;
  scale: (scale: number) => void;
  getElement: () => HTMLElement;
}
