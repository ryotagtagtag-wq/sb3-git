declare module 'scratchblocks' {
  interface RenderOptions {
    style?: 'scratch3' | 'scratch2'
    // Add other options as needed
  }
  
  function render(code: string, options?: RenderOptions): string
  
  export { render }
  export default { render }
}
