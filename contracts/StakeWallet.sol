pragma solidity ^0.4.18;


/**
 */
contract StakeWallet {
  event GrantCreated(address indexed user, address indexed partner, uint256 stakedValue, uint256 expirationDate, bool partOfJointGrant);
  event ReviewCreated(address indexed user, address indexed reviewer, bool negativeExperience, string comment);
  event GrantClosed(address user, address partner);

  struct Grant {
    bool exists;
    address user;
    address partner;
    uint256 stakedValue;
    uint256 expirationDate;
    bool partOfJointGrant;
  }

  mapping (address => mapping (address => Grant)) grants;

  function grant(address partner, uint256 expirationDate, bool partOfJointGrant) payable public returns (bool) {
    require(partner != msg.sender);
    require(expirationDate > now);

    // This implies that there can only be one grant for a user-partner transaction.
    // TODO: make multiple grants not overwrite existing grants. This is a big issue.
    // for now, just make sure there is not a pre-existing grant.
    require(grants[partner][msg.sender].exists == false);
    grants[partner][msg.sender] = Grant({
      exists: true,
      user: msg.sender,
      partner: partner,
      stakedValue: msg.value,
      expirationDate: expirationDate,
      partOfJointGrant: partOfJointGrant
    });

    GrantCreated(msg.sender, partner, msg.value, expirationDate, partOfJointGrant);
    return true;
  }

  function review(address partner, bool negativeExperience, string comments) payable public returns (bool) {
    require(grants[msg.sender][partner].exists == true);
    require(grants[msg.sender][partner].expirationDate > now);

    // clear out the Grant for this partner for this user
    grants[msg.sender][partner] = Grant({
      exists: false,
      user: 0,
      partner: 0,
      stakedValue: 0,
      expirationDate: 0,
      partOfJointGrant: false
    });

    ReviewCreated(partner, msg.sender, negativeExperience, comments);
    GrantClosed(partner, msg.sender);

    return true;
  }

  // It makes no sense to call this.
  function () public payable {
    revert();
  }

}
