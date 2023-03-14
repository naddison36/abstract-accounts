import { setBalance } from '@nomicfoundation/hardhat-network-helpers'
import { parseEther } from 'ethers/lib/utils'

import type { Signer } from 'ethers'

import type { Account } from '../types'

// impersonates a specific account
export const impersonate = async (addr: string, fund = true): Promise<Signer> => {
  // Dynamic import hardhat module to avoid importing while hardhat config is being defined.
  // The error this avoids is:
  // Error HH9: Error while loading Hardhat's configuration.
  // You probably tried to import the "hardhat" module from your config or a file imported from it.
  // This is not possible, as Hardhat can't be initialized while its config is being defined.
  const { network, ethers } = await import('hardhat')
  await network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [addr]
  })
  if (fund) {
    // Give the account 10 Ether
    await setBalance(addr, parseEther('10'))
  }
  return ethers.provider.getSigner(addr)
}

export const impersonateAccount = async (address: string, fund = true): Promise<Account> => {
  const signer = await impersonate(address, fund)
  return {
    signer,
    address
  }
}
