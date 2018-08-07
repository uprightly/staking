pragma solidity ^0.4.23;

import "../node_modules/zeppelin-solidity/contracts/ownership/Claimable.sol";

/**
 */
contract JointReviewGrant is Claimable {
    event JointGrantAttempted(address user, address partner, uint256 stakedValue, uint256 expirationDate);
    event JointGrantCreated(address user, address partner, uint256 expirationDate);
    event JointGrantCanceled(address user, address partner);
    event ReviewCreated(address reviewee, address reviewer, bool negativeExperience, string comments);

    struct Grant {
        bool exists;
        bool reviewed;
        bool negativeExperience;
        bool stakeReclaimed;
        address user;
        address partner;
        uint256 stakedValue;
        uint256 expirationDate;
    }

    mapping (address => mapping (address => Grant)) grants;

    uint256 public lostStakes;

    function attempt(address partner, uint256 expirationDate) payable public returns (bool) {
        require(partner != msg.sender);
        require(expirationDate > now);

        // This implies that there can only be one grant for a user-partner transaction.
        // TODO: make multiple grants not overwrite existing grants. This is a big issue.
        // for now, just make sure there is not a pre-existing grant.
        require(grants[partner][msg.sender].exists == false);

        // check if the partner already attempted to create a grant
        Grant storage partnerGrant = grants[msg.sender][partner];
        if (partnerGrant.exists == true) {
            // expiration date must be the same as the one that the partner submitted
            require(expirationDate == grants[msg.sender][partner].expirationDate);
        }

        grants[partner][msg.sender] = Grant({
            exists: true,
            reviewed: false,
            negativeExperience: false,
            stakeReclaimed: false,
            user: msg.sender,
            partner: partner,
            stakedValue: msg.value,
            expirationDate: expirationDate
        });

        emit JointGrantAttempted(msg.sender, partner, msg.value, expirationDate);

        if (partnerGrant.exists == true) {
            emit JointGrantCreated(msg.sender, partner, expirationDate);
        }

        return true;
    }

    function cancel(address partner) public returns (bool) {
        require(partner != msg.sender);
        require(grants[partner][msg.sender].exists == true);
        require(grants[msg.sender][partner].exists == false);

        grants[partner][msg.sender].exists = false;
        emit JointGrantCanceled(msg.sender, partner);

        msg.sender.transfer(grants[partner][msg.sender].stakedValue);

        return true;
    }

    function review(address partner, bool negativeExperience, string comments) public returns (bool) {
        require(partner != msg.sender);

        // We want to get the grant of the partner for this user
        // (`grants[msg.sender][partner]` instead of `grants[partner][msg.sender]`),
        // so this user can review the other person's grant.
        // We don't want the user to review themselves.
        Grant storage grantToReview = grants[msg.sender][partner];

        require(grantToReview.exists == true);

        Grant storage partnerGrant = grants[partner][msg.sender];
        require(partnerGrant.exists == true);

        require(grantToReview.expirationDate > now);
        require(grantToReview.reviewed == false);

        grantToReview.reviewed = true;
        grantToReview.negativeExperience = negativeExperience;

        emit ReviewCreated(partner, msg.sender, negativeExperience, comments);

        // check that the other review has been left. if so, make the stakes be lost.

        return true;
    }

    function reclaimStake(address partner) public returns (bool) {
        return true;
    }

    function withdrawLostStakes() public onlyOwner returns (bool) {
        return true;
    }

    // It makes no sense to call this.
    function () public payable {
        revert();
    }

}
