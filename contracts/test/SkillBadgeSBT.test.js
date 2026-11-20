const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SkillBadgeSBT", function () {
  let SkillBadgeSBT, skillBadge;
  let owner, issuer, student1, student2, stranger;

  const sampleProofHash = ethers.keccak256(ethers.toUtf8Bytes("ipfs-internship-proof-hash"));
  const sampleTokenURI = "ipfs://bafybeihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku";
  const BadgeTier = {
    Community: 0,
    Academic: 1,
    Enterprise: 2,
  };

  beforeEach(async function () {
    [owner, issuer, student1, student2, stranger] = await ethers.getSigners();

    SkillBadgeSBT = await ethers.getContractFactory("SkillBadgeSBT");
    skillBadge = await SkillBadgeSBT.deploy(owner.address);
    await skillBadge.waitForDeployment();
  });

  describe("Deployment & Initial State", function () {
    it("should set deployer as contract owner", async function () {
      expect(await skillBadge.owner()).to.equal(owner.address);
    });

    it("should initialize with 0 total badges", async function () {
      expect(await skillBadge.totalBadges()).to.equal(0);
    });
  });

  describe("Issuer Whitelist (Security Layer 2)", function () {
    it("should allow owner to authorize an issuer", async function () {
      await expect(skillBadge.connect(owner).setAuthorizedIssuer(issuer.address, true))
        .to.emit(skillBadge, "IssuerAuthorized")
        .withArgs(issuer.address, true);

      expect(await skillBadge.isAuthorizedIssuer(issuer.address)).to.be.true;
    });

    it("should revert if a non-owner tries to authorize an issuer", async function () {
      await expect(
        skillBadge.connect(stranger).setAuthorizedIssuer(stranger.address, true)
      ).to.be.revertedWithCustomError(skillBadge, "OwnableUnauthorizedAccount");
    });

    it("should prevent unauthorized address from issuing a badge", async function () {
      await expect(
        skillBadge.connect(stranger).issueBadge(
          student1.address,
          sampleTokenURI,
          BadgeTier.Enterprise,
          sampleProofHash
        )
      ).to.be.revertedWithCustomError(skillBadge, "NotAuthorizedIssuer");
    });
  });

  describe("Badge Issuance & Verification", function () {
    beforeEach(async function () {
      await skillBadge.connect(owner).setAuthorizedIssuer(issuer.address, true);
    });

    it("should issue a badge correctly by an authorized issuer", async function () {
      await expect(
        skillBadge.connect(issuer).issueBadge(
          student1.address,
          sampleTokenURI,
          BadgeTier.Enterprise,
          sampleProofHash
        )
      )
        .to.emit(skillBadge, "BadgeIssued")
        .withArgs(
          1,
          student1.address,
          issuer.address,
          BadgeTier.Enterprise,
          sampleProofHash,
          sampleTokenURI
        );

      expect(await skillBadge.ownerOf(1)).to.equal(student1.address);
      expect(await skillBadge.tokenURI(1)).to.equal(sampleTokenURI);
      expect(await skillBadge.totalBadges()).to.equal(1);

      const badge = await skillBadge.getBadge(1);
      expect(badge.tokenId).to.equal(1);
      expect(badge.recipient).to.equal(student1.address);
      expect(badge.issuer).to.equal(issuer.address);
      expect(badge.tier).to.equal(BadgeTier.Enterprise);
      expect(badge.proofHash).to.equal(sampleProofHash);
      expect(badge.isRevoked).to.be.false;
    });
  });

  describe("Soulbound Enforcement (Non-transferable)", function () {
    beforeEach(async function () {
      await skillBadge.connect(owner).setAuthorizedIssuer(issuer.address, true);
      await skillBadge.connect(issuer).issueBadge(
        student1.address,
        sampleTokenURI,
        BadgeTier.Academic,
        sampleProofHash
      );
    });

    it("should reject transferFrom attempts between users", async function () {
      await expect(
        skillBadge.connect(student1).transferFrom(student1.address, student2.address, 1)
      ).to.be.revertedWithCustomError(skillBadge, "SoulboundTokenCannotBeTransferred");
    });

    it("should reject safeTransferFrom attempts between users", async function () {
      await expect(
        skillBadge
          .connect(student1)
          ["safeTransferFrom(address,address,uint256)"](student1.address, student2.address, 1)
      ).to.be.revertedWithCustomError(skillBadge, "SoulboundTokenCannotBeTransferred");
    });
  });

  describe("Revocation Mechanism", function () {
    beforeEach(async function () {
      await skillBadge.connect(owner).setAuthorizedIssuer(issuer.address, true);
      await skillBadge.connect(issuer).issueBadge(
        student1.address,
        sampleTokenURI,
        BadgeTier.Academic,
        sampleProofHash
      );
    });

    it("should allow original issuer to revoke a badge", async function () {
      await expect(skillBadge.connect(issuer).revokeBadge(1, "Mistaken identity"))
        .to.emit(skillBadge, "BadgeRevoked")
        .withArgs(1, issuer.address, "Mistaken identity");

      const badge = await skillBadge.getBadge(1);
      expect(badge.isRevoked).to.be.true;

      // Token should be burned in ERC721
      await expect(skillBadge.ownerOf(1)).to.be.revertedWithCustomError(
        skillBadge,
        "ERC721NonexistentToken"
      );
    });

    it("should allow platform owner to revoke a badge", async function () {
      await expect(skillBadge.connect(owner).revokeBadge(1, "Admin intervention"))
        .to.emit(skillBadge, "BadgeRevoked")
        .withArgs(1, owner.address, "Admin intervention");

      const badge = await skillBadge.getBadge(1);
      expect(badge.isRevoked).to.be.true;
    });

    it("should revert if a stranger tries to revoke a badge", async function () {
      await expect(
        skillBadge.connect(stranger).revokeBadge(1, "Unauthorized revoke")
      ).to.be.revertedWithCustomError(skillBadge, "NotAuthorizedToRevoke");
    });
  });
});
