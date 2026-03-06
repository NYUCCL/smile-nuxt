import QRCode from 'qrcode-svg'

export default function generateQRCode() {
  let config
  return {
    name: 'smile-generate-qr', // name of the plugin
    configResolved(resolvedConfig) {
      // store the resolved config
      config = resolvedConfig

      // create the QR code
      var qrcode = new QRCode({
        content: `${config.env.VITE_CODE_NAME_DEPLOY_URL}`,
        padding: 4,
        width: 256,
        height: 256,
        color: '#000000',
        background: '#ffffff',
        xmlDeclaration: false,
        ecl: 'M',
      })
      let qrpath = `/qr.svg`
      qrcode.save(`./public${qrpath}`, function (error) {
        if (error) throw error
        //console.log('saved qr code to ./public/qr.svg')
      })
    },
  }
}
