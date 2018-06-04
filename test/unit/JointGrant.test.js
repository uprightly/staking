const JointGrant = artifacts.require("JointGrant");

import ether from 'zeppelin-solidity/test/helpers/ether';
import { advanceBlock } from 'zeppelin-solidity/test/helpers/advanceToBlock';
import { increaseTimeTo, duration } from 'zeppelin-solidity/test/helpers/increaseTime';
import latestTime from 'zeppelin-solidity/test/helpers/latestTime';
import expectThrow from 'zeppelin-solidity/test/helpers/expectThrow';

const BigNumber = web3.BigNumber;

require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bignumber')(BigNumber))
  .should();

async function getCost(response) {
  const responseTx = await web3.eth.getTransaction(response.tx);
  return responseTx.gasPrice.mul(response.receipt.gasUsed);
}

/**
 * Unit tests for a joint grant
 */
contract('JointGrant', function ([owner, user, tradePartner, randomUser]) {

  beforeEach(async function () {
    this.jointGrant = await JointGrant.new();
    await advanceBlock();
  });

  it("should allow for a way to do joint grants between two users", async function () {
    const userBalanceBefore = web3.eth.getBalance(user);
    const tradePartnerBalanceBefore = web3.eth.getBalance(tradePartner);

    const expirationDate = latestTime() + duration.weeks(1);
    const partOfJointGrant = true;

    // user creates a grant
    const stakedValue = ether(1);
    const response = await this.jointGrant.jointGrant(tradePartner, expirationDate, partOfJointGrant, { from: user, value: stakedValue });
    const userCost = getCost(response);
    const grantEvent = response.logs[0];

    assert.equal(grantEvent.event, "jointGrantAttempted");
    assert.equal(grantEvent.args.user, user);
    assert.equal(grantEvent.args.partner, tradePartner);
    assert.equal(grantEvent.args.expirationDate, expirationDate);
    assert.equal(grantEvent.args.partOfJointGrant, partOfJointGrant);
    grantEvent.args.stakedValue.should.be.bignumber.equal(stakedValue);

    // tradePartner creates a grant
    const secondStakedValue = ether(2);
    const secondResponse = await this.jointGrant.jointGrant(user, expirationDate, partOfJointGrant, { from: tradePartner, value: secondStakedValue });
    const tradePartnerCost = getCost(secondResponse);
    const secondGrantEvent = secondResponse.logs[0];

    assert.equal(secondGrantEvent.event, "jointGrantCreated");
    assert.equal(secondGrantEvent.args.user, tradePartner);
    assert.equal(secondGrantEvent.args.partner, user);
    assert.equal(secondGrantEvent.args.expirationDate, expirationDate);
    assert.equal(secondGrantEvent.args.partOfJointGrant, partOfJointGrant);
    secondGrantEvent.args.stakedValue.should.be.bignumber.equal(secondStakedValue);

    const userBalanceAfter = web3.eth.getBalance(user);
    const tradePartnerBalanceAfter = web3.eth.getBalance(tradePartner);

    userBalanceAfter.should.be.bignumber.equal(userBalanceBefore.sub(userCost).sub(stakedValue));
    tradePartnerBalanceAfter.should.be.bignumber.equal(tradePartnerBalanceBefore.sub(tradePartnerCost).sub(secondStakedValue));
  });

  it("should fail to create joint grant if expiration date does not match", async function () {
    const expirationDate = latestTime() + duration.weeks(1);
    const partOfJointGrant = true;

    // user creates a grant
    const stakedValue = ether(1);
    const response = await this.jointGrant.jointGrant(tradePartner, expirationDate, partOfJointGrant, { from: user, value: stakedValue });
    const grantEvent = response.logs[0];

    assert.equal(grantEvent.event, "jointGrantAttempted");

    // tradePartner creates a grant
    const wrongExpirationDate = latestTime() + duration.weeks(2);
    const secondStakedValue = ether(2);
    expectThrow(this.jointGrant.jointGrant(user, wrongExpirationDate, partOfJointGrant, { from: tradePartner, value: secondStakedValue }));

  });

  it("should allow user to cancel and reclaim stake for an attempted joint grant that has not been created yet", async function () {
    const balanceBefore = web3.eth.getBalance(user);
    const expirationDate = latestTime() + duration.weeks(1);
    const partOfJointGrant = true;

    // user creates a grant
    const stakedValue = ether(1);
    const response = await this.jointGrant.jointGrant(tradePartner, expirationDate, { from: user, value: stakedValue });
    responseCost = getCost(response);
    const grantEvent = response.logs[0];

    assert.equal(grantEvent.event, "jointGrantAttempted");

    const recallResponse = await this.recallJointGrant(tradePartner, { from: user });
    const recallCost = getCost(recallResponse);
    const recallEvent = response.logs[0];

    assert.equal(recallEvent.event, "jointGrantRecalled");
    assert.equal(recallEvent.args.user, user);
    assert.equal(recallEvent.args.partner, tradePartner);

    const balanceAfter = web3.eth.getBalance(user);

    balanceAfter.should.be.bignumber.equal(balanceBefore.sub(responseCost).sub(recallCost));

  });

  it("should fail to create a joint grant if a user attempts and then cancels before the other party attempts", async function () {
    const expirationDate = latestTime() + duration.weeks(1);
    const partOfJointGrant = true;

    // user creates a grant
    const stakedValue = ether(1);
    await this.jointGrant.grant(tradePartner, expirationDate, partOfJointGrant, { from: user, value: stakedValue });
    await this.recallJointGrant(tradePartner, { from: user });

    // tradePartner creates a grant
    const secondStakedValue = ether(2);
    const response = await this.jointGrant.jointGrant(user, expirationDate, partOfJointGrant, { from: tradePartner, value: secondStakedValue });

    const grantEvent = response.logs[0];

    // this indicates that the recalled grant attempt is no longer valid, otherwise this would have created a joint grant.
    assert.equal(grantEvent.event, "jointGrantAttempted");
  });

  it("should allow users to leave reviews for each other in a joint grant", async function () {
    const expirationDate = latestTime() + duration.weeks(1);
    const partOfJointGrant = true;

    // user creates a grant
    const stakedValue = ether(1);
    await this.jointGrant.jointGrant(tradePartner, expirationDate, partOfJointGrant, { from: user, value: stakedValue });

    // tradePartner creates a grant
    const secondStakedValue = ether(2);
    await this.jointGrant.jointGrant(user, expirationDate, partOfJointGrant, { from: tradePartner, value: secondStakedValue });

    // todo
  });

  it("should keep reviews secret until both have submitted a review", async function () {
    const expirationDate = latestTime() + duration.weeks(1);
    const partOfJointGrant = true;

    // user creates a grant
    const stakedValue = ether(1);
    await this.jointGrant.jointGrant(tradePartner, expirationDate, partOfJointGrant, { from: user, value: stakedValue });

    // tradePartner creates a grant
    const secondStakedValue = ether(2);
    await this.jointGrant.jointGrant(user, expirationDate, partOfJointGrant, { from: tradePartner, value: secondStakedValue });

    // todo

  });

  it("should reveal reviews after both are submitted", async function () {
    const expirationDate = latestTime() + duration.weeks(1);
    const partOfJointGrant = true;

    // user creates a grant
    const stakedValue = ether(1);
    await this.jointGrant.jointGrant(tradePartner, expirationDate, partOfJointGrant, { from: user, value: stakedValue });

    // tradePartner creates a grant
    const secondStakedValue = ether(2);
    await this.jointGrant.jointGrant(user, expirationDate, partOfJointGrant, { from: tradePartner, value: secondStakedValue });

    // todo

  });

  it("should allow users to reclaim stakes as long as one review is positive", async function () {
    const expirationDate = latestTime() + duration.weeks(1);
    const partOfJointGrant = true;

    // user creates a grant
    const stakedValue = ether(1);
    await this.jointGrant.jointGrant(tradePartner, expirationDate, partOfJointGrant, { from: user, value: stakedValue });

    // tradePartner creates a grant
    const secondStakedValue = ether(2);
    await this.jointGrant.jointGrant(user, expirationDate, partOfJointGrant, { from: tradePartner, value: secondStakedValue });

    // todo

  });

  it("should treat an expired review as a positive experience and allow reclaiming of stakes", async function () {
    const expirationDate = latestTime() + duration.weeks(1);
    const partOfJointGrant = true;

    // user creates a grant
    const stakedValue = ether(1);
    await this.jointGrant.jointGrant(tradePartner, expirationDate, partOfJointGrant, { from: user, value: stakedValue });

    // tradePartner creates a grant
    const secondStakedValue = ether(2);
    await this.jointGrant.jointGrant(user, expirationDate, partOfJointGrant, { from: tradePartner, value: secondStakedValue });

    // todo

  });

  it("should not allow reclaiming of stakes if both reviews are negative", async function () {
    const expirationDate = latestTime() + duration.weeks(1);
    const partOfJointGrant = true;

    // user creates a grant
    const stakedValue = ether(1);
    await this.jointGrant.jointGrant(tradePartner, expirationDate, partOfJointGrant, { from: user, value: stakedValue });

    // tradePartner creates a grant
    const secondStakedValue = ether(2);
    await this.jointGrant.jointGrant(user, expirationDate, partOfJointGrant, { from: tradePartner, value: secondStakedValue });

    // todo

  });

  it("should allow contract owner to retrieve lost stakes", async function () {
    const expirationDate = latestTime() + duration.weeks(1);
    const partOfJointGrant = true;

    // user creates a grant
    const stakedValue = ether(1);
    await this.jointGrant.jointGrant(tradePartner, expirationDate, partOfJointGrant, { from: user, value: stakedValue });

    // tradePartner creates a grant
    const secondStakedValue = ether(2);
    await this.jointGrant.jointGrant(user, expirationDate, partOfJointGrant, { from: tradePartner, value: secondStakedValue });

    // todo

  });

  it("should not allow non-owner to retrieve lost stakes", async function () {
    const expirationDate = latestTime() + duration.weeks(1);
    const partOfJointGrant = true;

    // user creates a grant
    const stakedValue = ether(1);
    await this.jointGrant.jointGrant(tradePartner, expirationDate, partOfJointGrant, { from: user, value: stakedValue });

    // tradePartner creates a grant
    const secondStakedValue = ether(2);
    await this.jointGrant.jointGrant(user, expirationDate, partOfJointGrant, { from: tradePartner, value: secondStakedValue });

    // todo

  });


});
