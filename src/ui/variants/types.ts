export interface Variant {
  id: string;
  name: string;
  desc: string;
  render(): HTMLElement[];
}
