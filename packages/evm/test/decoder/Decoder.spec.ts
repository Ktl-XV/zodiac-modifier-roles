import hre from "hardhat";
import assert from "assert";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

import { AddressOne } from "@gnosis.pm/safe-contracts";
import { BigNumber } from "ethers";
import { defaultAbiCoder } from "ethers/lib/utils";

import { Operator, ParameterType } from "../utils";

const YesRemoveOffset = true;
const DontRemoveOffset = false;

describe("Decoder library", async () => {
  async function setup() {
    const TestEncoder = await hre.ethers.getContractFactory("TestEncoder");
    const testEncoder = await TestEncoder.deploy();

    const MockDecoder = await hre.ethers.getContractFactory("MockDecoder");
    const decoder = await MockDecoder.deploy();

    return {
      testEncoder,
      decoder,
    };
  }

  it("pluck fails if calldata is too short", async () => {
    const { testEncoder, decoder } = await loadFixture(setup);

    const { data } = await testEncoder.populateTransaction.dynamicTuple({
      dynamic: "0xaabbccdd",
      _static: 234,
      dynamic32: [],
    });

    const layout = {
      paramType: ParameterType.Calldata,
      operator: Operator.Matches,
      children: [
        {
          paramType: ParameterType.Tuple,
          operator: Operator.Pass,
          children: [
            {
              paramType: ParameterType.Dynamic,
              operator: Operator.Pass,
              children: [],
            },
            {
              paramType: ParameterType.Static,
              operator: Operator.Pass,
              children: [],
            },
            {
              paramType: ParameterType.Array,
              operator: Operator.Pass,
              children: [
                {
                  paramType: ParameterType.Static,
                  operator: Operator.Pass,
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    };

    await expect(decoder.inspect((data as string).slice(0, -64), layout)).to.be
      .reverted;
  });
  it("pluck fails with param scoped out of bounds", async () => {
    const { testEncoder, decoder } = await loadFixture(setup);

    const { data } = await testEncoder.populateTransaction.staticFn(
      "0xaabbccdd"
    );

    assert(data);

    const layout = {
      paramType: ParameterType.Calldata,
      operator: Operator.Matches,
      children: [
        {
          paramType: ParameterType.Static,
          operator: Operator.Pass,
          children: [],
        },
        {
          paramType: ParameterType.Static,
          operator: Operator.Pass,
          children: [],
        },
      ],
    };

    const result = await decoder.inspect(data, layout);

    await expect(
      decoder.pluck(data, result.children[1].location, result.children[1].size)
    ).to.be.reverted;
  });

  it("plucks Static from top level", async () => {
    const { decoder, testEncoder } = await loadFixture(setup);

    // (bytes2[],string,uint32)

    const { data } =
      await testEncoder.populateTransaction.dynamic32DynamicStatic(
        ["0xaabb", "0x1234", "0xff33"],
        "Hello World!",
        123456789
      );

    assert(data);

    const layout = {
      paramType: ParameterType.Calldata,
      operator: Operator.Matches,
      children: [
        {
          paramType: ParameterType.Array,
          operator: Operator.Pass,
          children: [
            {
              paramType: ParameterType.Static,
              operator: Operator.Pass,
              children: [],
            },
          ],
        },
        {
          paramType: ParameterType.Dynamic,
          operator: Operator.Pass,
          children: [],
        },
        {
          paramType: ParameterType.Static,
          operator: Operator.Pass,
          children: [],
        },
      ],
    };

    const result = await decoder.inspect(data, layout);
    expect(
      await decoder.pluck(
        data,
        result.children[2].location,
        result.children[2].size
      )
    ).to.equal(BigNumber.from(123456789));
  });
  it("plucks Static from Tuple", async () => {
    const { decoder, testEncoder } = await loadFixture(setup);

    const { data } = await testEncoder.populateTransaction.staticTuple(
      {
        a: 1999,
        b: AddressOne,
      },
      2000
    );

    assert(data);

    const layout = {
      paramType: ParameterType.Calldata,
      operator: Operator.Pass,
      children: [
        {
          paramType: ParameterType.Static,
          operator: Operator.Pass,
          children: [],
        },
        {
          paramType: ParameterType.Static,
          operator: Operator.Pass,
          children: [],
        },
        {
          paramType: ParameterType.Static,
          operator: Operator.Pass,
          children: [],
        },
      ],
    };

    const result = await decoder.inspect(data as string, layout);

    expect(
      await decoder.pluck(
        data,
        result.children[0].location,
        result.children[0].size
      )
    ).to.equal(encode(["uint256"], [1999]));

    expect(
      await decoder.pluck(
        data,
        result.children[1].location,
        result.children[1].size
      )
    ).to.equal(
      encode(["address"], ["0x0000000000000000000000000000000000000001"])
    );
  });
  it("plucks Static from Array", async () => {
    const { decoder, testEncoder } = await loadFixture(setup);

    // function arrayStaticTupleItems(tuple(uint256 a, address b)[])
    const { data } =
      await testEncoder.populateTransaction.arrayStaticTupleItems([
        {
          a: 95623,
          b: "0x00000000219ab540356cbb839cbe05303d7705fa",
        },
        {
          a: 11542,
          b: "0x0716a17fbaee714f1e6ab0f9d59edbc5f09815c0",
        },
      ]);

    const layout = {
      paramType: ParameterType.Calldata,
      operator: Operator.Matches,
      children: [
        {
          paramType: ParameterType.Array,
          operator: Operator.Pass,
          children: [
            {
              paramType: ParameterType.Tuple,
              operator: Operator.Pass,
              children: [
                {
                  paramType: ParameterType.Static,
                  operator: Operator.Pass,
                  children: [],
                },
                {
                  paramType: ParameterType.Static,
                  operator: Operator.Pass,
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    };
    const result = await decoder.inspect(data as string, layout);
    const arrayEntry2 = result.children[0].children[1];
    expect(
      await decoder.pluck(
        data as string,
        arrayEntry2.children[0].location,
        arrayEntry2.children[0].size
      )
    ).to.equal(encode(["uint256"], [11542], DontRemoveOffset));

    expect(
      await decoder.pluck(
        data as string,
        arrayEntry2.children[1].location,
        arrayEntry2.children[1].size
      )
    ).to.equal(
      encode(
        ["address"],
        ["0x0716a17fbaee714f1e6ab0f9d59edbc5f09815c0"],
        DontRemoveOffset
      )
    );
  });
  it("plucks Static from nested AbiEncoded", async () => {
    const { decoder, testEncoder } = await loadFixture(setup);

    const staticValue = 98712;
    const bytesValue = "0xaa22330d5a";

    const { data: nestedData } =
      await testEncoder.populateTransaction.staticDynamic(
        staticValue,
        bytesValue
      );

    const { data } = await testEncoder.populateTransaction.dynamic(
      nestedData as string
    );

    const nestedLayout = {
      paramType: ParameterType.Calldata,
      operator: Operator.Pass,
      children: [
        {
          paramType: ParameterType.Static,
          operator: Operator.Pass,
          children: [],
        },
        {
          paramType: ParameterType.Dynamic,
          operator: Operator.Pass,
          children: [],
        },
      ],
    };

    const layout = {
      paramType: ParameterType.Calldata,
      operator: Operator.Pass,
      children: [nestedLayout],
    };

    const result = await decoder.inspect(data as string, layout);

    const staticNode = result.children[0].children[0];
    expect(
      await decoder.pluck(data as string, staticNode.location, staticNode.size)
    ).to.equal(encode(["uint256"], [staticValue], DontRemoveOffset));

    const dynamicNode = result.children[0].children[1];
    expect(
      await decoder.pluck(
        data as string,
        dynamicNode.location,
        dynamicNode.size
      )
    ).to.equal(encode(["bytes"], [bytesValue], YesRemoveOffset));
  });

  it("plucks Dynamic from top level", async () => {
    const { decoder, testEncoder } = await loadFixture(setup);

    const { data } =
      await testEncoder.populateTransaction.dynamic32DynamicStatic(
        [],
        "Hello World!",
        123456789
      );

    assert(data);

    const layout = {
      paramType: ParameterType.Calldata,
      operator: Operator.Matches,
      children: [
        {
          paramType: ParameterType.Array,
          operator: Operator.Pass,
          children: [
            {
              paramType: ParameterType.Static,
              operator: Operator.Pass,
              children: [],
            },
          ],
        },
        {
          paramType: ParameterType.Dynamic,
          operator: Operator.Pass,
          children: [],
        },
        {
          paramType: ParameterType.Static,
          operator: Operator.Pass,
          children: [],
        },
      ],
    };

    const result = await decoder.inspect(data, layout);

    expect(
      await decoder.pluck(
        data,
        result.children[1].location,
        result.children[1].size
      )
    ).to.equal(encode(["string"], ["Hello World!"], YesRemoveOffset));
  });
  it("plucks Dynamic from Tuple", async () => {
    const { decoder, testEncoder } = await loadFixture(setup);

    const { data } = await testEncoder.populateTransaction._dynamicTuple({
      dynamic: "0xabcd0011",
    });

    assert(data);
    const layout = {
      paramType: ParameterType.Calldata,
      operator: Operator.Matches,
      children: [
        {
          paramType: ParameterType.Tuple,
          operator: Operator.Pass,
          children: [
            {
              paramType: ParameterType.Dynamic,
              operator: Operator.Pass,
              children: [],
            },
          ],
        },
      ],
    };

    const result = await decoder.inspect(data, layout);

    expect(
      await decoder.pluck(
        data,
        result.children[0].location,
        result.children[0].size
      )
    ).to.equal(encode(["tuple(bytes)"], [["0xabcd0011"]], YesRemoveOffset));
  });
  it("plucks Dynamic from Array", async () => {
    const { decoder, testEncoder } = await loadFixture(setup);

    const { data } = await testEncoder.populateTransaction.dynamicArray([
      "0xaabbccdd",
      "0x004466ff",
    ]);

    const layout = {
      paramType: ParameterType.Calldata,
      operator: Operator.Matches,
      children: [
        {
          paramType: ParameterType.Array,
          operator: Operator.Pass,
          children: [
            {
              paramType: ParameterType.Dynamic,
              operator: Operator.Pass,
              children: [],
            },
          ],
        },
      ],
    };

    const result = await decoder.inspect(data as string, layout);

    const arrayElement0 = result.children[0].children[0];
    const arrayElement1 = result.children[0].children[1];
    expect(
      await decoder.pluck(
        data as string,
        arrayElement0.location,
        arrayElement0.size
      )
    ).to.equal(encode(["bytes"], ["0xaabbccdd"], YesRemoveOffset));

    expect(
      await decoder.pluck(
        data as string,
        arrayElement1.location,
        arrayElement1.size
      )
    ).to.equal(encode(["bytes"], ["0x004466ff"], YesRemoveOffset));
  });
  it("plucks Dynamic from nested AbiEncoded", async () => {
    const { decoder, testEncoder } = await loadFixture(setup);

    const { data: nestedData } =
      await testEncoder.populateTransaction.dynamicStaticDynamic32(
        "0xbadfed",
        true,
        ["0xccdd"]
      );

    assert(nestedData);

    const { data } = await testEncoder.populateTransaction._dynamicTuple({
      dynamic: nestedData,
    });

    const nestedLayout = {
      paramType: ParameterType.Calldata,
      operator: Operator.Matches,
      children: [
        {
          paramType: ParameterType.Dynamic,
          operator: Operator.Pass,
          children: [],
        },
        {
          paramType: ParameterType.Static,
          operator: Operator.Pass,
          children: [],
        },
        {
          paramType: ParameterType.Array,
          operator: Operator.Pass,
          children: [
            {
              paramType: ParameterType.Static,
              operator: Operator.Pass,
              children: [],
            },
          ],
        },
      ],
    };

    const layout = {
      paramType: ParameterType.Calldata,
      operator: Operator.Matches,
      children: [
        {
          paramType: ParameterType.Tuple,
          operator: Operator.Pass,
          children: [nestedLayout],
        },
      ],
    };

    const result = await decoder.inspect(data as string, layout);

    const tupleField = result.children[0].children[0].children[0];
    expect(
      await decoder.pluck(data as string, tupleField.location, tupleField.size)
    ).to.equal(encode(["bytes"], ["0xbadfed"], YesRemoveOffset));
  });

  it.skip("plucks Tuple from top level");
  it.skip("plucks Tuple from Tuple");
  it.skip("plucks Tuple from Array");
  it.skip("plucks Tuple from nested AbiEncoded");
  it("plucks Tuple with multiple dynamic fields", async () => {
    const { decoder, testEncoder } = await loadFixture(setup);

    const { data } = await testEncoder.populateTransaction.multiDynamicTuple({
      a: "0xaa",
      b: 123,
      c: "0xbadfed",
      d: [2, 3, 4],
    });

    assert(data);

    const layout = {
      paramType: ParameterType.Calldata,
      operator: Operator.Matches,
      children: [
        {
          paramType: ParameterType.Tuple,
          operator: Operator.Pass,
          children: [
            {
              paramType: ParameterType.Dynamic,
              operator: Operator.Pass,
              children: [],
            },
            {
              paramType: ParameterType.Static,
              operator: Operator.Pass,
              children: [],
            },
            {
              paramType: ParameterType.Dynamic,
              operator: Operator.Pass,
              children: [],
            },
            {
              paramType: ParameterType.Array,
              operator: Operator.Pass,
              children: [
                {
                  paramType: ParameterType.Static,
                  operator: Operator.Pass,
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = await decoder.inspect(data as string, layout);

    const field1 = result.children[0].children[0];
    const field2 = result.children[0].children[1];
    const field3 = result.children[0].children[2];
    const field4 = result.children[0].children[3];

    expect(
      await decoder.pluck(data as string, field1.location, field1.size)
    ).to.equal(encode(["bytes"], ["0xaa"], YesRemoveOffset));

    expect(
      await decoder.pluck(data as string, field2.location, field2.size)
    ).to.equal(encode(["uint256"], [123], DontRemoveOffset));

    expect(
      await decoder.pluck(data as string, field3.location, field3.size)
    ).to.equal(encode(["bytes"], ["0xbadfed"], YesRemoveOffset));

    expect(
      await decoder.pluck(data as string, field4.location, field4.size)
    ).to.equal(encode(["uint256[]"], [[2, 3, 4]], YesRemoveOffset));
  });

  it.skip("plucks Array from top level");
  it.skip("plucks Array from Tuple");
  it.skip("plucks Array from Array");
  it.skip("plucks Array from nested AbiEncoded");

  describe("TypeTree", async () => {
    it("top level variants get unfolded to its entrypoint form", async () => {
      const { decoder, testEncoder } = await loadFixture(setup);

      const { data } = await testEncoder.populateTransaction.staticDynamic(
        123,
        "0xaabbccddeeff"
      );
      assert(data);

      const layout = {
        paramType: ParameterType.None,
        operator: Operator.Or,
        children: [
          {
            paramType: ParameterType.Calldata,
            operator: Operator.Matches,
            children: [
              {
                paramType: ParameterType.Static,
                operator: Operator.Pass,
                children: [],
              },
              {
                paramType: ParameterType.Dynamic,
                operator: Operator.EqualTo,
                children: [],
              },
            ],
          },
          {
            paramType: ParameterType.Calldata,
            operator: Operator.Matches,
            children: [
              {
                paramType: ParameterType.Static,
                operator: Operator.EqualTo,
                children: [],
              },
              {
                paramType: ParameterType.Dynamic,
                operator: Operator.EqualTo,
                children: [],
              },
            ],
          },
          {
            paramType: ParameterType.Calldata,
            operator: Operator.Matches,
            children: [
              {
                paramType: ParameterType.Static,
                operator: Operator.EqualTo,
                children: [],
              },
              {
                paramType: ParameterType.Dynamic,
                operator: Operator.EqualTo,
                children: [],
              },
            ],
          },
        ],
      };

      const result = await decoder.inspect(data, layout);
      expect(await decoder.pluck(data, result.location, result.size)).to.equal(
        data
      );

      const firstParam = result.children[0];
      expect(
        await decoder.pluck(data, firstParam.location, firstParam.size)
      ).to.equal(encode(["uint256"], [123]));

      const secondParam = result.children[1];
      expect(
        await decoder.pluck(data, secondParam.location, secondParam.size)
      ).to.equal(encode(["bytes"], ["0xaabbccddeeff"], YesRemoveOffset));
    });
    it("And gets unfolded to Static", async () => {
      const { decoder, testEncoder } = await loadFixture(setup);

      const { data } = await testEncoder.populateTransaction.staticFn(
        "0xeeff3344"
      );

      assert(data);

      const layout = {
        paramType: ParameterType.Calldata,
        operator: Operator.Matches,
        children: [
          {
            paramType: ParameterType.None,
            operator: Operator.And,
            children: [
              {
                paramType: ParameterType.Static,
                operator: Operator.EqualTo,
                children: [],
              },
              {
                paramType: ParameterType.Static,
                operator: Operator.EqualTo,
                children: [],
              },
            ],
          },
        ],
      };

      const result = await decoder.inspect(data, layout);
      const staticField = result.children[0];
      expect(
        await decoder.pluck(data, staticField.location, staticField.size)
      ).to.equal(encode(["bytes4"], ["0xeeff3344"], DontRemoveOffset));
    });
    it("Or gets unfolded to Array - From Tuple", async () => {
      const { decoder, testEncoder } = await loadFixture(setup);

      const { data } = await testEncoder.populateTransaction.dynamicTuple({
        dynamic: "0xaabb",
        _static: 88221,
        dynamic32: [1, 2, 3, 4, 5],
      });

      assert(data);

      const layout = {
        paramType: ParameterType.Calldata,
        operator: Operator.Matches,
        children: [
          {
            paramType: ParameterType.Tuple,
            operator: Operator.Matches,
            children: [
              {
                paramType: ParameterType.Dynamic,
                operator: Operator.Pass,
                children: [],
              },
              {
                paramType: ParameterType.Static,
                operator: Operator.Pass,
                children: [],
              },
              {
                paramType: ParameterType.None,
                operator: Operator.Or,
                children: [
                  {
                    paramType: ParameterType.Array,
                    operator: Operator.EqualTo,
                    children: [
                      {
                        paramType: ParameterType.Static,
                        operator: Operator.EqualTo,
                        children: [],
                      },
                    ],
                  },
                  {
                    paramType: ParameterType.Array,
                    operator: Operator.EqualTo,
                    children: [
                      {
                        paramType: ParameterType.Static,
                        operator: Operator.EqualTo,
                        children: [],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = await decoder.inspect(data, layout);

      const tupleField = result.children[0];
      expect(
        await decoder.pluck(data, tupleField.location, tupleField.size)
      ).to.equal(
        encode(
          ["tuple(bytes,uint256,uint256[])"],
          [["0xaabb", 88221, [1, 2, 3, 4, 5]]],
          YesRemoveOffset
        )
      );

      const arrayField = result.children[0].children[2];
      expect(
        await decoder.pluck(data, arrayField.location, arrayField.size)
      ).to.equal(encode(["uint256[]"], [[1, 2, 3, 4, 5]], YesRemoveOffset));
    });
    it("Or gets unfolded to Static - From Array", async () => {
      const { decoder, testEncoder } = await loadFixture(setup);

      const { data } = await testEncoder.populateTransaction.dynamicTuple({
        dynamic: "0xaabb",
        _static: 88221,
        dynamic32: [7, 8, 9],
      });

      assert(data);

      const layout = {
        paramType: ParameterType.Calldata,
        operator: Operator.Matches,
        children: [
          {
            paramType: ParameterType.Tuple,
            operator: Operator.Matches,
            children: [
              {
                paramType: ParameterType.Dynamic,
                operator: Operator.Pass,
                children: [],
              },
              {
                paramType: ParameterType.Static,
                operator: Operator.Pass,
                children: [],
              },
              {
                paramType: ParameterType.Array,
                operator: Operator.EqualTo,
                children: [
                  {
                    paramType: ParameterType.None,
                    operator: Operator.Or,
                    children: [
                      {
                        paramType: ParameterType.Static,
                        operator: Operator.EqualTo,
                        children: [],
                      },
                      {
                        paramType: ParameterType.Static,
                        operator: Operator.EqualTo,
                        children: [],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = await decoder.inspect(data, layout);

      const tupleField = result.children[0];
      expect(
        await decoder.pluck(data, tupleField.location, tupleField.size)
      ).to.equal(
        encode(
          ["tuple(bytes,uint256,uint256[])"],
          [["0xaabb", 88221, [7, 8, 9]]],
          YesRemoveOffset
        )
      );

      const arrayField = result.children[0].children[2];
      expect(
        await decoder.pluck(data, arrayField.location, arrayField.size)
      ).to.equal(encode(["uint256[]"], [[7, 8, 9]], YesRemoveOffset));
    });
    it("extraneous Value in AbiEncoded gets inspected as None", async () => {
      const { decoder, testEncoder } = await loadFixture(setup);
      const { data } = await testEncoder.populateTransaction.staticFn(
        "0xeeff3344"
      );
      assert(data);

      const layout = {
        paramType: ParameterType.Calldata,
        operator: Operator.Matches,
        children: [
          {
            paramType: ParameterType.None,
            operator: Operator.EtherWithinAllowance,
            children: [],
          },
          {
            paramType: ParameterType.Static,
            operator: Operator.EqualTo,
            children: [],
          },
        ],
      };

      const result = await decoder.inspect(data, layout);

      const extraneousField = result.children[0];
      expect(extraneousField.location).to.equal(4);
      expect(extraneousField.size).to.equal(0);

      const staticField = result.children[1];
      expect(staticField.location).to.equal(4);
      expect(staticField.size).to.equal(32);
    });
  });
});

function encode(types: any, values: any, removeOffset = false) {
  const result = defaultAbiCoder.encode(types, values);
  return removeOffset ? `0x${result.slice(66)}` : result;
}
