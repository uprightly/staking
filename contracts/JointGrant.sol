pragma solidity ^0.4.23;

import "../node_modules/zeppelin-solidity/contracts/ownership/Claimable.sol";

/**
 */
contract JointGrant is Claimable {

    function attempt(address partner, uint256 expirationDate) payable public returns (bool) {
        return true;
    }

    function cancel(address partner) public returns (bool) {
        return true;
    }

    function submitReview(address partner, bytes32 negativeExperienceHash, bytes32 commentsHash) public returns (bool) {
        return true;
    }

    function revealReview(address partner, bool negativeExperience, string comments) public returns (bool) {
        return true;
    }

    function reclaimStake(address partner) public returns (bool) {
        return true;
    }

    function claimLostStakes() public onlyOwner returns (bool) {
        return true;
    }

    // It makes no sense to call this.
    function () public payable {
        revert();
    }

}
