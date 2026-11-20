// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title SkillBadgeSBT
 * @notice Soulbound Token (SBT) representing verifiable student skills and internship records on Avalanche Fuji.
 * @dev Non-transferable ERC-721 token with authorized issuer whitelist and revocation support.
 * Complies with the SkillPass Web2.5 architecture (UniHack 2026).
 */
contract SkillBadgeSBT is ERC721URIStorage, Ownable {
    // Custom Errors
    error SoulboundTokenCannotBeTransferred();
    error NotAuthorizedIssuer();
    error ZeroAddressNotAllowed();
    error EmptyTokenURI();
    error BadgeNotFound();
    error BadgeAlreadyRevoked();
    error NotAuthorizedToRevoke();

    // 3-tier Reputation Badge as defined in PROJECT_CONTEXT.md
    enum BadgeTier {
        Community, // 0: Community Verified
        Academic,  // 1: Academic Verified (e.g., @hcmut.edu.vn)
        Enterprise // 2: Enterprise Verified (e.g., @fpt.com)
    }

    // On-chain struct for verification and auditing
    struct Badge {
        uint256 tokenId;
        address recipient;
        address issuer;
        BadgeTier tier;
        bytes32 proofHash; // SHA-256 hash of IPFS evidence proof for cross-checking
        uint256 issuedAt;
        bool isRevoked;
    }

    // Auto-incrementing token ID counter
    uint256 private _nextTokenId;

    // Whitelist: mapping of authorized issuer addresses (Level 2 Security in PROJECT_CONTEXT.md)
    mapping(address => bool) public isAuthorizedIssuer;

    // Token ID to Badge metadata record
    mapping(uint256 => Badge) private _badges;

    // Events
    event IssuerAuthorized(address indexed issuer, bool status);
    event BadgeIssued(
        uint256 indexed tokenId,
        address indexed recipient,
        address indexed issuer,
        BadgeTier tier,
        bytes32 proofHash,
        string tokenURI
    );
    event BadgeRevoked(
        uint256 indexed tokenId,
        address indexed revoker,
        string reason
    );

    modifier onlyAuthorizedIssuer() {
        if (!isAuthorizedIssuer[msg.sender] && msg.sender != owner()) {
            revert NotAuthorizedIssuer();
        }
        _;
    }

    /**
     * @param initialOwner Address of the contract owner (Platform Admin / Multistig)
     */
    constructor(address initialOwner)
        ERC721("SkillPass Soulbound Badge", "SKILL")
        Ownable(initialOwner)
    {
        if (initialOwner == address(0)) {
            revert ZeroAddressNotAllowed();
        }
    }

    /**
     * @notice Authorize or revoke an issuer on-chain
     * @param issuer Address of the institution or enterprise issuer
     * @param status True to authorize, false to revoke
     */
    function setAuthorizedIssuer(address issuer, bool status) external onlyOwner {
        if (issuer == address(0)) {
            revert ZeroAddressNotAllowed();
        }
        isAuthorizedIssuer[issuer] = status;
        emit IssuerAuthorized(issuer, status);
    }

    /**
     * @notice Batch set authorized issuers
     * @param issuers Array of issuer addresses
     * @param status True to authorize, false to revoke
     */
    function batchSetAuthorizedIssuer(address[] calldata issuers, bool status) external onlyOwner {
        for (uint256 i = 0; i < issuers.length; i++) {
            if (issuers[i] != address(0)) {
                isAuthorizedIssuer[issuers[i]] = status;
                emit IssuerAuthorized(issuers[i], status);
            }
        }
    }

    /**
     * @notice Issue a new Soulbound Badge to a student
     * @param recipient Student wallet address receiving the badge
     * @param uri IPFS metadata URI (Pinata)
     * @param tier Reputation tier (Community, Academic, Enterprise)
     * @param proofHash SHA-256 hash of evidence documents stored on IPFS
     * @return tokenId The newly minted badge token ID
     */
    function issueBadge(
        address recipient,
        string calldata uri,
        BadgeTier tier,
        bytes32 proofHash
    ) external onlyAuthorizedIssuer returns (uint256) {
        if (recipient == address(0)) {
            revert ZeroAddressNotAllowed();
        }
        if (bytes(uri).length == 0) {
            revert EmptyTokenURI();
        }

        uint256 tokenId = ++_nextTokenId;

        _safeMint(recipient, tokenId);
        _setTokenURI(tokenId, uri);

        _badges[tokenId] = Badge({
            tokenId: tokenId,
            recipient: recipient,
            issuer: msg.sender,
            tier: tier,
            proofHash: proofHash,
            issuedAt: block.timestamp,
            isRevoked: false
        });

        emit BadgeIssued(tokenId, recipient, msg.sender, tier, proofHash, uri);

        return tokenId;
    }

    /**
     * @notice Revoke an erroneously issued badge
     * @param tokenId The token ID of the badge to revoke
     * @param reason Explanation for revocation
     */
    function revokeBadge(uint256 tokenId, string calldata reason) external {
        Badge storage badge = _badges[tokenId];
        if (badge.recipient == address(0)) {
            revert BadgeNotFound();
        }
        if (badge.isRevoked) {
            revert BadgeAlreadyRevoked();
        }

        // Only platform owner or the original issuer can revoke
        if (msg.sender != owner() && msg.sender != badge.issuer) {
            revert NotAuthorizedToRevoke();
        }

        badge.isRevoked = true;

        // Burn token to remove from active ERC-721 circulation
        _burn(tokenId);

        emit BadgeRevoked(tokenId, msg.sender, reason);
    }

    /**
     * @notice Get badge metadata details for verification
     * @param tokenId The badge token ID
     */
    function getBadge(uint256 tokenId) external view returns (Badge memory) {
        Badge memory badge = _badges[tokenId];
        if (badge.recipient == address(0)) {
            revert BadgeNotFound();
        }
        return badge;
    }

    /**
     * @notice Total number of badges minted
     */
    function totalBadges() external view returns (uint256) {
        return _nextTokenId;
    }

    /**
     * @dev Enforces Soulbound Token rules: tokens cannot be transferred between regular accounts.
     * Minting (from == address(0)) and burning (to == address(0)) are permitted.
     */
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal virtual override returns (address) {
        address from = _ownerOf(tokenId);

        // Soulbound constraint: tokens are permanently non-transferable once issued
        if (from != address(0) && to != address(0)) {
            revert SoulboundTokenCannotBeTransferred();
        }

        return super._update(to, tokenId, auth);
    }

    // Overrides required by Solidity for ERC721URIStorage
    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
