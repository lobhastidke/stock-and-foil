// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title StockFoilRegistry
 * @notice Privacy-preserving invoice commitment & duplicate-financing registry
 *         for Stock & Foil ("Finance the invoice. Not the fraud.").
 * @dev Stores only opaque commitments, markers, and states. No invoice details,
 *      amounts, dates, or PII ever touch this contract. Non-payable, non-upgradeable.
 */
contract StockFoilRegistry is AccessControl {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    enum State {
        None,
        Registered,
        Acknowledged,
        Rejected,
        Pledged,
        Settled
    }

    struct InvoiceRecord {
        State state;
        bytes32 supplierRef;
        bytes32 buyerRef;
        bytes32 financierRef;
        uint64 registeredAt;
        uint64 updatedAt;
    }

    mapping(bytes32 => InvoiceRecord) private invoices;
    mapping(bytes32 => bool) private pledgeMarkerUsed;

    // --- Custom Errors ---
    error ZeroValue();
    error AlreadyRegistered();
    error WrongState();
    error NotBuyer();
    error NotFinancier();
    error PledgeMarkerAlreadyUsed();
    error InvalidPledgeMarker();
    error UnknownCommitment();

    // --- Events ---
    event InvoiceRegistered(
        bytes32 indexed commitment,
        bytes32 indexed supplierRef,
        bytes32 indexed buyerRef
    );

    event AcknowledgementRecorded(
        bytes32 indexed commitment,
        bytes32 indexed buyerRef,
        bool accepted
    );

    event PledgeRegistered(
        bytes32 indexed commitment,
        bytes32 indexed pledgeMarker,
        bytes32 indexed financierRef
    );

    event InvoiceSettled(
        bytes32 indexed commitment,
        bytes32 indexed financierRef
    );

    /**
     * @notice Initializes the registry, granting admin and operator roles.
     * @param defaultAdmin Address assigned DEFAULT_ADMIN_ROLE.
     * @param operator Address assigned OPERATOR_ROLE (the backend relayer).
     */
    constructor(address defaultAdmin, address operator) {
        if (defaultAdmin == address(0) || operator == address(0)) {
            revert ZeroValue();
        }
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(OPERATOR_ROLE, operator);
    }

    /**
     * @notice Computes the deterministic pledge marker for a commitment.
     * @dev marker = keccak256(abi.encodePacked("STOCKFOIL_PLEDGE_V1", commitment))
     * @param commitment The 32-byte invoice commitment.
     */
    function computePledgeMarker(bytes32 commitment) public pure returns (bytes32) {
        return keccak256(abi.encodePacked("STOCKFOIL_PLEDGE_V1", commitment));
    }

    /**
     * @notice Registers a new invoice commitment.
     * @dev Only OPERATOR_ROLE. Commitment must be non-zero and not previously registered.
     */
    function registerInvoice(
        bytes32 commitment,
        bytes32 supplierRef,
        bytes32 buyerRef
    ) external onlyRole(OPERATOR_ROLE) {
        if (commitment == bytes32(0) || supplierRef == bytes32(0) || buyerRef == bytes32(0)) {
            revert ZeroValue();
        }

        InvoiceRecord storage record = invoices[commitment];
        if (record.state != State.None) {
            revert AlreadyRegistered();
        }

        record.state = State.Registered;
        record.supplierRef = supplierRef;
        record.buyerRef = buyerRef;
        record.registeredAt = uint64(block.timestamp);
        record.updatedAt = uint64(block.timestamp);

        emit InvoiceRegistered(commitment, supplierRef, buyerRef);
    }

    /**
     * @notice Records buyer acknowledgement or rejection of an invoice commitment.
     * @dev Only OPERATOR_ROLE. Invoice must be in Registered state and caller buyerRef must match.
     */
    function recordAcknowledgement(
        bytes32 commitment,
        bytes32 buyerRef,
        bool accepted
    ) external onlyRole(OPERATOR_ROLE) {
        if (commitment == bytes32(0) || buyerRef == bytes32(0)) {
            revert ZeroValue();
        }

        InvoiceRecord storage record = invoices[commitment];
        if (record.state == State.None) {
            revert UnknownCommitment();
        }
        if (record.state != State.Registered) {
            revert WrongState();
        }
        if (record.buyerRef != buyerRef) {
            revert NotBuyer();
        }

        record.state = accepted ? State.Acknowledged : State.Rejected;
        record.updatedAt = uint64(block.timestamp);

        emit AcknowledgementRecorded(commitment, buyerRef, accepted);
    }

    /**
     * @notice Atomically registers a financing pledge on an acknowledged invoice.
     * @dev Only OPERATOR_ROLE. The provided pledgeMarker MUST strictly match computePledgeMarker(commitment).
     *      Reverts if the marker was already used on this or any invoice (Checks-Effects-Interactions).
     */
    function registerPledge(
        bytes32 commitment,
        bytes32 pledgeMarker,
        bytes32 financierRef
    ) external onlyRole(OPERATOR_ROLE) {
        if (commitment == bytes32(0) || pledgeMarker == bytes32(0) || financierRef == bytes32(0)) {
            revert ZeroValue();
        }

        InvoiceRecord storage record = invoices[commitment];
        if (record.state == State.None) {
            revert UnknownCommitment();
        }
        bytes32 expectedMarker = computePledgeMarker(commitment);
        if (pledgeMarker != expectedMarker) {
            revert InvalidPledgeMarker();
        }

        if (pledgeMarkerUsed[pledgeMarker]) {
            revert PledgeMarkerAlreadyUsed();
        }

        if (record.state != State.Acknowledged) {
            revert WrongState();
        }

        // Checks-Effects-Interactions: state changes before any exit
        pledgeMarkerUsed[pledgeMarker] = true;
        record.state = State.Pledged;
        record.financierRef = financierRef;
        record.updatedAt = uint64(block.timestamp);

        emit PledgeRegistered(commitment, pledgeMarker, financierRef);
    }

    /**
     * @notice Marks a pledged invoice as settled upon repayment.
     * @dev Only OPERATOR_ROLE. Invoice must be in Pledged state and financierRef must match pledger.
     */
    function markSettled(
        bytes32 commitment,
        bytes32 financierRef
    ) external onlyRole(OPERATOR_ROLE) {
        if (commitment == bytes32(0) || financierRef == bytes32(0)) {
            revert ZeroValue();
        }

        InvoiceRecord storage record = invoices[commitment];
        if (record.state == State.None) {
            revert UnknownCommitment();
        }
        if (record.state != State.Pledged) {
            revert WrongState();
        }
        if (record.financierRef != financierRef) {
            revert NotFinancier();
        }

        record.state = State.Settled;
        record.updatedAt = uint64(block.timestamp);

        emit InvoiceSettled(commitment, financierRef);
    }

    /**
     * @notice Returns the full invoice record for a commitment.
     */
    function getInvoice(bytes32 commitment) external view returns (InvoiceRecord memory) {
        return invoices[commitment];
    }

    /**
     * @notice Checks whether a pledge marker has already been used in the registry.
     */
    function isPledgeMarkerUsed(bytes32 marker) external view returns (bool) {
        return pledgeMarkerUsed[marker];
    }
}
