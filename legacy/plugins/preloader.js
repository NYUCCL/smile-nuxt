export default function preLoaderPlugin() {
  const loaderMatch = /\.vue\?preload$/
  return {
    name: 'smile-preloader', // name of the plugin
    async transform(src, id) {
      if (loaderMatch.test(id)) {
        console.log('source', src)
        // const mod_name = id.replace(/\?preload$/, '')
        // try {
        //   const module = await import(mod_name)
        //   const preload = module.default || module
        //   const result = preload()
        //   console.log(result)
        // } catch (error) {
        //   console.error(`Error importing ${mod_name}:`, error)
        // }
      }
      return null
    },
  }
}
