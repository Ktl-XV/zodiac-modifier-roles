import { Contract, PopulatedTransaction } from "ethers"
import { formatBytes32String } from "ethers/lib/utils"
import { encodeMulti, MetaTransaction, OperationType } from "ethers-multisend"

import ROLES_ABI from "../../evm/build/artifacts/contracts/Roles.sol/Roles.json"
import { Roles } from "../../evm/typechain-types"

const MULTI_SEND_CALL_ONLY = "0x40A2aCCbd92BCA938b02010E17A5b8929b49130D"

// TODO implement members diffing/patching instead of this
// - diffMembers(currentMembers, nextMembers)
// - patchMembers(currentMembers, nextMembers)
export const addMembers = async (
  rolesContractAddress: string,
  roleKey: string,
  members: string[]
) => {
  const contract = new Contract(
    rolesContractAddress,
    ROLES_ABI.abi
  ) as unknown as Roles
  return encodeMulti(
    (
      await Promise.all(
        members.map((member) =>
          contract.populateTransaction.assignRoles(
            member,
            [formatBytes32String(roleKey)],
            [true]
          )
        )
      )
    ).map(asMetaTransaction),
    MULTI_SEND_CALL_ONLY
  )
}

const asMetaTransaction = (
  populatedTransaction: PopulatedTransaction
): MetaTransaction => {
  return {
    to: populatedTransaction.to || "",
    data: populatedTransaction.data || "",
    value: populatedTransaction.value?.toHexString() || "0",
    operation: OperationType.Call,
  }
}
