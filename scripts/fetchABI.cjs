const https = require('https');
const fs = require('fs');

const CONTRACT_ADDRESS = '0x2B4652Bd6149E407E3F57190E25cdBa1FC9d37d8';
const BASESCAN_API_KEY = 'YWJFI8X3T2GJKDSFYRBE4PES17XAPIC2C1';
const BASESCAN_API_URL = `https://api.basescan.org/api?module=contract&action=getabi&address=${CONTRACT_ADDRESS}&apikey=${BASESCAN_API_KEY}`;

console.log('Fetching ABI from BaseScan for:', CONTRACT_ADDRESS);

https.get(BASESCAN_API_URL, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const response = JSON.parse(data);

      if (response.status === '1' && response.result) {
        const abi = JSON.parse(response.result);

        // Save to file
        fs.writeFileSync('./scripts/PixelPonyABI.json', JSON.stringify(abi, null, 2));
        console.log('✅ ABI saved to scripts/PixelPonyABI.json');

        // Print event signatures
        console.log('\n📋 Contract Events:');
        const events = abi.filter(item => item.type === 'event');
        events.forEach(event => {
          console.log(`  - ${event.name}(${event.inputs.map(i => i.type).join(', ')})`);
        });

        // Look for RaceExecuted event
        const raceEvent = events.find(e => e.name === 'RaceExecuted');
        if (raceEvent) {
          console.log('\n🏁 RaceExecuted Event Details:');
          console.log(JSON.stringify(raceEvent, null, 2));
        }
      } else {
        console.error('❌ Error fetching ABI:', response.result);
      }
    } catch (error) {
      console.error('❌ Error parsing response:', error);
    }
  });
}).on('error', (error) => {
  console.error('❌ Request error:', error);
});
