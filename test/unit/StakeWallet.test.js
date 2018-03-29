const StakeWallet = artifacts.require("StakeWallet");

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

/**
 * Unit tests for the stake wallet
 */
contract('StakeWallet', function ([owner, user, tradePartner]) {

  beforeEach(async function () {
    this.stakeWallet = await StakeWallet.new();
    await advanceBlock();
  });

  it("should allow a user to submit a grant and a stake amount", async function () {
    const expirationDate = latestTime() + duration.weeks(1);
    const partOfJointGrant = false;
    const stakedValue = ether(1);

    const response = await this.stakeWallet.grant(tradePartner, expirationDate, partOfJointGrant, { from: user, value: stakedValue });

    const grantEvent = response.logs[0];

    assert.equal(grantEvent.event, "GrantCreated");
    assert.equal(grantEvent.args.user, user);
    assert.equal(grantEvent.args.partner, tradePartner);
    assert.equal(grantEvent.args.expirationDate, expirationDate);
    assert.equal(grantEvent.args.partOfJointGrant, partOfJointGrant);
    grantEvent.args.stakedValue.should.be.bignumber.equal(stakedValue);
  });

  it("should allow a user leave a review for a user that granted them a review", async function () {
    // set up the test with a grant from user to tradePartner.
    const expirationDate = latestTime() + duration.weeks(1);
    const partOfJointGrant = false;
    const stakedValue = ether(1);
    await this.stakeWallet.grant(tradePartner, expirationDate, partOfJointGrant, { from: user, value: stakedValue });

    // tradePartner attempts to review.
    const negativeExperience = false;
    const comment = "some comment about the experience";
    const response = await this.stakeWallet.review(user, negativeExperience, comment, { from: tradePartner });

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
    expectThrow(this.stakeWallet.review(user, negativeExperience, comment, { from: tradePartner }));

  });

  it("should allow the owner to retrieve the stake after a positive review", async function () {
    const userBalanceBefore = web3.eth.getBalance(user);

    // user creates a grant
    const expirationDate = latestTime() + duration.weeks(1);
    const partOfJointGrant = false;
    const stakedValue = ether(1);
    const grantResponse = await this.stakeWallet.grant(tradePartner, expirationDate, partOfJointGrant, { from: user, value: stakedValue });
    const grantResponseTx = await web3.eth.getTransaction(grantResponse.tx);
    const grantCost = grantResponseTx.gasPrice.mul(grantResponse.receipt.gasUsed);

    // tradePartner positively reviews.
    const negativeExperience = false;
    const comment = "very positive review!";
    await this.stakeWallet.review(user, negativeExperience, comment, { from: tradePartner });

    const partnerBalanceBefore = web3.eth.getBalance(tradePartner);

    // must specify which grant to retrieve because it could be expired,
    // so we can't just assume they can withdraw from an aggregate fund.
    // in order to do that, we'd have to loop over all grants for this user
    // to discover if any are expired.
    const reclaimStakeResponse = await this.stakeWallet.reclaimStake(tradePartner, { from: user });
    const reclaimStakeTx = await web3.eth.getTransaction(reclaimStakeResponse.tx);
    const reclaimStakeCost = reclaimStakeTx.gasPrice.mul(reclaimStakeResponse.receipt.gasUsed);

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

  it("should allow the owner to retrieve the stake after the expiration date if no review was left", async function () {
    const userBalanceBefore = web3.eth.getBalance(user);

    // user creates a grant
    const expirationDate = latestTime() + duration.weeks(1);
    const partOfJointGrant = false;
    const stakedValue = ether(1);
    const grantResponse = await this.stakeWallet.grant(tradePartner, expirationDate, partOfJointGrant, { from: user, value: stakedValue });
    const grantResponseTx = await web3.eth.getTransaction(grantResponse.tx);
    const grantCost = grantResponseTx.gasPrice.mul(grantResponse.receipt.gasUsed);

    const partnerBalanceBefore = web3.eth.getBalance(tradePartner);

    // time passes and it expires with no review left
    await increaseTimeTo(expirationDate + 1);

    // attempt to reclaim stake after grant expired
    const reclaimStakeResponse = await this.stakeWallet.reclaimStake(tradePartner, { from: user });
    const reclaimStakeTx = await web3.eth.getTransaction(reclaimStakeResponse.tx);
    const reclaimStakeCost = reclaimStakeTx.gasPrice.mul(reclaimStakeResponse.receipt.gasUsed);

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

  });

  it("should not allow a user to retrieve the stake after a negative review", async function () {

  });

  it("should allow the Uprightly team to retrieve lost stakes from negative reviews", async function () {

  });

  it("should allow for a way to do joint grants between two users", async function () {

  });

  it("should allow users to leave reviews for each other in a joint grant", async function () {

  });

  it("should allow both users to retrieve stakes after atleast one positive review was left during a joint grant", async function () {

  });

  it("should not allow users to retrieve stakes if both left a negative review in a joint grant", async function () {

  });


});
