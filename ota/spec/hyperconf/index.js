/* eslint-disable space-before-function-paren */

const schema = require('../hyperschema')
const runtime = require('hyperconf/runtime')

const productionEncoding = schema.getEncoding('@gear/config')
const production = decode(
  productionEncoding,
  runtime.b4a.from('AQH9hAEJaG9sZXB1bmNoAwI0cWl5c2Q5eDNjd2s0N3diMWtocmJpdzFpZThnajl1dHRudDNtd2NncjlvYnRoYjk2a3h4bzQ0ZXNjNGE5Z284cmNhZDQza2tndHJyNHV5cXNzdW8xdzlwMW96eXkzYjE0anpxNzdmaWp5AnYHcGFwYXJhbU1naXQrcGVhcjovLzAuMjEyLm42YXkzNGt3Zjg2dW1pampzdHh6aHVydDdnNjZ1eDkzd2NiMXpic254bmtoNWR3ZXhnN3kvcGFwYXJhbQEeU3RyaWN0IGFuZCBmYWlyIHBhcmFtZXRlciBwYXBhlQ13aGljaC1ydW50aW1lUmdpdCtwZWFyOi8vMC4yOS5xd2F5cHQ1ZjVlZXl6cHljeXExaXFpZjd3NzY1MWoxYmlmNGFiYmo4cmczeWZjeWExemd5L3doaWNoLXJ1bnRpbWUBMkRldGVjdCBpZiB5b3UgYXJlIGluIEJhcmUgb3IgTm9kZSBhbmQgd2hpY2ggb3MgZXRj', 'base64')
)

const developmentEncoding = null
const development = null

module.exports = {
  production,
  development,
  productionEncoding,
  developmentEncoding
}

function decode(enc, buf) {
  return enc.decode({ start: 0, end: buf.byteLength, buffer: buf })
}
