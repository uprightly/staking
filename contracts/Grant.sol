pragma solidity ^0.4.23;

import "../node_modules/zeppelin-solidity/contracts/ownership/Claimable.sol";

/**
 */
contract Grant is Claimable {
    event GrantCreated(address indexed user, address indexed partner, uint256 stakedValue, uint256 expirationDate);
    event ReviewCreated(address indexed user, address indexed reviewer, bool negativeExperience, string comment);
    event GrantClosed(address indexed user, address indexed partner);
    event StakeReclaimed(address indexed user, address indexed partner);
    event StakeLost(address indexed user, uint value);
    event LostStakesClaimed(uint value);

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

    function create(address partner, uint256 expirationDate) payable public returns (bool) {
        require(partner != msg.sender);
        require(expirationDate > now);

        // This implies that there can only be one grant for a user-partner transaction.
        // TODO: make multiple grants not overwrite existing grants. This is a big issue.
        // for now, just make sure there is not a pre-existing grant.
        require(grants[partner][msg.sender].exists == false);

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

        emit GrantCreated(msg.sender, partner, msg.value, expirationDate);
        return true;
    }

    function review(address partner, bool negativeExperience, string comments) public returns (bool) {
        require(grants[msg.sender][partner].exists == true);
        require(grants[msg.sender][partner].reviewed == false);
        require(grants[msg.sender][partner].expirationDate > now);

        // Mark the Grant for this partner for this user reviewed and note the review
        grants[msg.sender][partner].reviewed = true;
        grants[msg.sender][partner].negativeExperience = negativeExperience;

        if (negativeExperience) {
            // the stake has been claimed by the contract and added to lostStakes
            lostStakes += grants[msg.sender][partner].stakedValue;
            grants[partner][msg.sender].stakeReclaimed = true;
            emit StakeLost(partner, grants[msg.sender][partner].stakedValue);
        }

        emit ReviewCreated(partner, msg.sender, negativeExperience, comments);
        emit GrantClosed(partner, msg.sender);

        return true;
    }

    function reviewedPositively(address partner, address sender) private view returns (bool) {
        return grants[partner][sender].reviewed == true && grants[partner][sender].negativeExperience == false;
    }

    function grantExpired(address partner, address sender) private view returns (bool) {
        return grants[partner][sender].expirationDate < now;
    }

    function reclaimStake(address partner) public returns (bool) {
        require(grants[partner][msg.sender].exists == true);
        require(reviewedPositively(partner, msg.sender) || grantExpired(partner, msg.sender));
        require(grants[partner][msg.sender].stakeReclaimed == false);

        // This ends the grant, clear it out. Unsure at this point if we still need the grant for the dual-grant feature
        // so just use a boolean to flag this as reclaimed already.
        grants[partner][msg.sender].stakeReclaimed = true;
        emit StakeReclaimed(msg.sender, partner);

        msg.sender.transfer(grants[partner][msg.sender].stakedValue);

        return true;
    }

    function withdrawLostStakes() public onlyOwner returns (bool) {
        uint256 stakesToSend = lostStakes;
        lostStakes = 0;
        emit LostStakesClaimed(stakesToSend);
        msg.sender.transfer(stakesToSend);
        return true;
    }

    // It makes no sense to call this.
    function () public payable {
        revert();
    }

}
