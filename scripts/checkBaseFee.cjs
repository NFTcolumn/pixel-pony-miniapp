const { ethers } = require('ethers');

const PIXEL_PONY_ADDRESS = '0x2B4652Bd6149E407E3F57190E25cdBa1FC9d37d8';
const BASE_RPC = 'https://mainnet.base.org';

// Minimal ABI just for baseFeeAmount
const ABI = [
  {
    inputs: [],
    name: 'baseFeeAmount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
];

async function checkBaseFee() {
  try {
    const provider = new ethers.providers.JsonRpcProvider(BASE_RPC);
    const contract = new ethers.Contract(PIXEL_PONY_ADDRESS, ABI, provider);

    const baseFee = await contract.baseFeeAmount();

    console.log('Contract Address:', PIXEL_PONY_ADDRESS);
    console.log('Base Fee (wei):', baseFee.toString());
    console.log('Base Fee (ETH):', ethers.utils.formatEther(baseFee));

    const expectedFee = ethers.utils.parseEther('0.0005');
    console.log('\nExpected Fee (0.0005 ETH):', expectedFee.toString(), 'wei');
    console.log('Actual matches expected?', baseFee.toString() === expectedFee.toString());

  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkBaseFee();
