const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying SkillBadgeSBT with account:", deployer.address);

  const SkillBadgeSBT = await hre.ethers.getContractFactory("SkillBadgeSBT");
  // Pass deployer as initialOwner for Ownable(initialOwner)
  const skillBadgeSBT = await SkillBadgeSBT.deploy(deployer.address);

  await skillBadgeSBT.waitForDeployment();
  const contractAddress = await skillBadgeSBT.getAddress();

  console.log("SkillBadgeSBT deployed successfully to:", contractAddress);

  // Auto-export ABI and deployed address to mobile/src/constants/contract.json
  const artifact = await hre.artifacts.readArtifact("SkillBadgeSBT");
  const contractConfig = {
    address: contractAddress,
    chainId: hre.network.config.chainId || 43113,
    network: hre.network.name,
    abi: artifact.abi,
  };

  const mobileConstantPath = path.resolve(
    __dirname,
    "../../mobile/src/constants/contract.json"
  );

  fs.writeFileSync(
    mobileConstantPath,
    JSON.stringify(contractConfig, null, 2)
  );

  console.log(`Contract ABI and address exported to: ${mobileConstantPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
