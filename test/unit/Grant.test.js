const Grant = artifacts.require("Grant");

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
 * Unit tests for the stake wallet
 */
contract('Grant', function ([owner, user, tradePartner, randomUser]) {

  beforeEach(async function () {
    this.grant = await Grant.new();
    await advanceBlock();
  });

  it("should allow a user to submit a grant and a stake amount", async function () {
    const balanceBefore = web3.eth.getBalance(user);

    const expirationDate = latestTime() + duration.weeks(1);
    const stakedValue = ether(1);

    const response = await this.grant.create(tradePartner, expirationDate, { from: user, value: stakedValue });
    const cost = await getCost(response);

    const grantEvent = response.logs[0];

    const balanceAfter = web3.eth.getBalance(user);

    assert.equal(grantEvent.event, "GrantCreated");
    assert.equal(grantEvent.args.user, user);
    assert.equal(grantEvent.args.partner, tradePartner);
    assert.equal(grantEvent.args.expirationDate, expirationDate);
    grantEvent.args.stakedValue.should.be.bignumber.equal(stakedValue);

    balanceAfter.should.be.bignumber.equal(balanceBefore.sub(cost).sub(stakedValue));
  });

  it("should not allow a user to submit a grant and a stake amount if one already exists for the tradePartner", async function () {
    const balanceBefore = web3.eth.getBalance(user);

    const expirationDate = latestTime() + duration.weeks(1);
    const stakedValue = ether(1);

    await this.grant.create(tradePartner, expirationDate, { from: user, value: stakedValue });
    // try again while there is already an active one.
    expectThrow(this.grant.create(tradePartner, expirationDate, { from: user, value: stakedValue }));

  });

  it("should allow a user leave a review for a user that granted them a review", async function () {
    // set up the test with a grant from user to tradePartner.
    const expirationDate = latestTime() + duration.weeks(1);
    const stakedValue = ether(1);
    await this.grant.create(tradePartner, expirationDate, { from: user, value: stakedValue });

    // tradePartner attempts to review.
    const negativeExperience = false;
    const comment = "some comment about the experience";
    const response = await this.grant.review(user, negativeExperience, comment, { from: tradePartner });

    const reviewCreated = response.logs[0];
    const grantClosed = response.logs[1];

    assert.equal(reviewCreated.event, "ReviewCreated");
    assert.equal(reviewCreated.args.user, user);
    assert.equal(reviewCreated.args.reviewer, tradePartner);
    assert.equal(reviewCreated.args.negativeExperience, negativeExperience);
    assert.equal(reviewCreated.args.comment, comment);

    assert.equal(grantClosed.event, "GrantClosed");
    assert.equal(grantClosed.args.user, user);
    assert.equal(grantClosed.args.partner, tradePartner);

  });

  it("should not allow a user leave a review for a user that did not grant a review", async function () {
    // tradePartner attempts to review without a grant.
    const negativeExperience = false;
    const comment = "some comment about the experience";
    expectThrow(this.grant.review(user, negativeExperience, comment, { from: tradePartner }));

  });

  it("should allow the user to retrieve the stake after a positive review", async function () {
    const userBalanceBefore = web3.eth.getBalance(user);

    // user creates a grant
    const expirationDate = latestTime() + duration.weeks(1);
    const stakedValue = ether(1);
    const grantResponse = await this.grant.create(tradePartner, expirationDate, { from: user, value: stakedValue });
    const grantCost = await getCost(grantResponse);

    // tradePartner positively reviews.
    const negativeExperience = false;
    const comment = "very positive review!";
    await this.grant.review(user, negativeExperience, comment, { from: tradePartner });

    const partnerBalanceBefore = web3.eth.getBalance(tradePartner);

    // must specify which grant to retrieve because it could be expired,
    // so we can't just assume they can withdraw from an aggregate fund.
    // in order to do that, we'd have to loop over all grants for this user
    // to discover if any are expired.
    const reclaimStakeResponse = await this.grant.reclaimStake(tradePartner, { from: user });
    const reclaimStakeCost = await getCost(reclaimStakeResponse);

    const partnerBalanceAfter = web3.eth.getBalance(tradePartner);

    // check that the staked value was returned.
    const stakeReclaimed = reclaimStakeResponse.logs[0];
    assert.equal(stakeReclaimed.event, "StakeReclaimed");
    assert.equal(stakeReclaimed.args.user, user);
    assert.equal(stakeReclaimed.args.partner, tradePartner);

    const userBalanceAfter = web3.eth.getBalance(user);
    const expectedUserBalanceAfter = userBalanceBefore.sub(grantCost).sub(reclaimStakeCost);
    userBalanceAfter.should.be.bignumber.equal(expectedUserBalanceAfter);

    partnerBalanceBefore.should.be.bignumber.equal(partnerBalanceAfter);

  });

  it("should allow the user to retrieve the stake after the expiration date if no review was left", async function () {
    const userBalanceBefore = web3.eth.getBalance(user);

    // user creates a grant
    const expirationDate = latestTime() + duration.weeks(1);
    const stakedValue = ether(1);
    const grantResponse = await this.grant.create(tradePartner, expirationDate, { from: user, value: stakedValue });
    const grantCost = await getCost(grantResponse);

    const partnerBalanceBefore = web3.eth.getBalance(tradePartner);

    // time passes and it expires with no review left
    await increaseTimeTo(expirationDate + 1);

    // attempt to reclaim stake after grant expired
    const reclaimStakeResponse = await this.grant.reclaimStake(tradePartner, { from: user });
    const reclaimStakeCost = await getCost(reclaimStakeResponse);

    const partnerBalanceAfter = web3.eth.getBalance(tradePartner);

    // check that the staked value was returned.
    const stakeReclaimed = reclaimStakeResponse.logs[0];
    assert.equal(stakeReclaimed.event, "StakeReclaimed");
    assert.equal(stakeReclaimed.args.user, user);
    assert.equal(stakeReclaimed.args.partner, tradePartner);

    const userBalanceAfter = web3.eth.getBalance(user);
    const expectedUserBalanceAfter = userBalanceBefore.sub(grantCost).sub(reclaimStakeCost);
    userBalanceAfter.should.be.bignumber.equal(expectedUserBalanceAfter);

    partnerBalanceBefore.should.be.bignumber.equal(partnerBalanceAfter);
  });

  it("should not allow the user to retrieve the stake before the expiration date if no review is left", async function () {
    // user creates a grant
    const expirationDate = latestTime() + duration.weeks(1);
    const stakedValue = ether(1);
    await this.grant.create(tradePartner, expirationDate, { from: user, value: stakedValue });

    // attempt to reclaim stake before a review is left and before the grant expired
    expectThrow(this.grant.reclaimStake(tradePartner, { from: user }));
  });

  it("should not allow a user to retrieve the stake after a negative review", async function () {
    // user creates a grant
    const expirationDate = latestTime() + duration.weeks(1);
    const stakedValue = ether(1);
    await this.grant.create(tradePartner, expirationDate, { from: user, value: stakedValue });

    // tradePartner negatively reviews.
    const negativeExperience = true;
    const comment = "some bad review";
    await this.grant.review(user, negativeExperience, comment, { from: tradePartner });

    // try to reclaim after a negative review.
    expectThrow(this.grant.reclaimStake(tradePartner, { from: user }));

  });

  it("should allow the Uprightly team to retrieve lost stakes from negative reviews", async function () {
    // user creates a grant
    const expirationDate = latestTime() + duration.weeks(1);
    const stakedValue = ether(1);
    await this.grant.create(tradePartner, expirationDate, { from: user, value: stakedValue });

    // tradePartner negatively reviews.
    const negativeExperience = true;
    const comment = "some bad review";
    await this.grant.review(user, negativeExperience, comment, { from: tradePartner });

    // check the value of claims that were negative
    const amountForClaiming = await this.grant.lostStakes();
    amountForClaiming.should.be.bignumber.equal(stakedValue);

    // owner (uprightly team) can claim the stake
    const ownerBalanceBefore = web3.eth.getBalance(owner);
    const response = await this.grant.withdrawLostStakes({ from: owner });
    const claimLostStakesCost = await getCost(response);
    const ownerBalanceAfter = web3.eth.getBalance(owner);
    ownerBalanceAfter.should.be.bignumber.equal(ownerBalanceBefore.add(amountForClaiming).sub(claimLostStakesCost));

  });

  it("should not allow anyone but the owner to retrieve lost stakes from negative reviews", async function () {
    // user creates a grant
    const expirationDate = latestTime() + duration.weeks(1);
    const stakedValue = ether(1);
    await this.grant.create(tradePartner, expirationDate, { from: user, value: stakedValue });

    // tradePartner negatively reviews.
    const negativeExperience = true;
    const comment = "some bad review";
    await this.grant.review(user, negativeExperience, comment, { from: tradePartner });

    // check the value of claims that were negative
    const amountForClaiming = await this.grant.lostStakes();
    amountForClaiming.should.be.bignumber.equal(stakedValue);

    // random person cannot claim the stake
    expectThrow(this.grant.withdrawLostStakes({ from: randomUser }));

  });

});
