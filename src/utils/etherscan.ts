import { sleep } from './time'

import type { HardhatRuntimeEnvironment } from 'hardhat/types'

import type { VerifyEtherscan } from '../types'

export const verifyEtherscan = async (hre: HardhatRuntimeEnvironment, contract: VerifyEtherscan): Promise<void> => {
  if (hre != null && hre.network.name !== 'local' && hre.network.name !== 'anvil' && !!process.env.ETHERSCAN_KEY) {
    // wait for the Etherscan backend to pick up the deployed contract
    await sleep(20000)

    console.log(`About to verify ${contract.address} on Etherscan`)
    await hre.run('verify:verify', contract)
  }
}
