declare module "js-untar" {
  interface UntarEntry {
    name: string
    buffer: ArrayBuffer
  }

  interface UntarResult extends Promise<UntarEntry[]> {
    progress(callback: (percent: number) => void): UntarResult
  }

  export default function untar(buffer: ArrayBuffer): UntarResult
}

declare module "guacamole-common-js-jumpserver/dist/guacamole-common" {
  const Guacamole: any
  export = Guacamole
}
