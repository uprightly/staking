const JointReviewGrant = artifacts.require("JointReviewGrant");

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
contract('JointReviewGrant', function ([owner, user, tradePartner, randomUser]) {

  beforeEach(async function () {
    this.jointGrant = await JointReviewGrant.new();
    await advanceBlock();
  });

  it("should allow for a way to do joint grants between two users", async function () {
    const userBalanceBefore = web3.eth.getBalance(user);
    const tradePartnerBalanceBefore = web3.eth.getBalance(tradePartner);

    const expirationDate = latestTime() + duration.weeks(1);

    // user creates a grant
    const stakedValue = ether(1);
    const response = await this.jointGrant.attempt(tradePartner, expirationDate, { from: user, value: stakedValue });
    const userCost = getCost(response);
    const grantEvent = response.logs[0];

    assert.equal(grantEvent.event, "jointGrantAttempted");
    assert.equal(grantEvent.args.user, user);
    assert.equal(grantEvent.args.partner, tradePartner);
    assert.equal(grantEvent.args.expirationDate, expirationDate);
    grantEvent.args.stakedValue.should.be.bignumber.equal(stakedValue);

    // tradePartner creates a grant
    const secondStakedValue = ether(2);
    const secondResponse = await this.jointGrant.attempt(user, expirationDate, { from: tradePartner, value: secondStakedValue });
    const tradePartnerCost = getCost(secondResponse);
    const secondGrantEvent = secondResponse.logs[0];

    assert.equal(secondGrantEvent.event, "jointGrantCreated");
    assert.equal(secondGrantEvent.args.user, tradePartner);
    assert.equal(secondGrantEvent.args.partner, user);
    assert.equal(secondGrantEvent.args.expirationDate, expirationDate);
    secondGrantEvent.args.stakedValue.should.be.bignumber.equal(secondStakedValue);

    const userBalanceAfter = web3.eth.getBalance(user);
    const tradePartnerBalanceAfter = web3.eth.getBalance(tradePartner);

    userBalanceAfter.should.be.bignumber.equal(userBalanceBefore.sub(userCost).sub(stakedValue));
    tradePartnerBalanceAfter.should.be.bignumber.equal(tradePartnerBalanceBefore.sub(tradePartnerCost).sub(secondStakedValue));
  });

  it("should not allow a user to attempt a grant with the same tradePartner without canceling first", async function () {

    const expirationDate = latestTime() + duration.weeks(1);

    // user creates a grant
    const stakedValue = ether(1);
    await this.jointGrant.attempt(tradePartner, expirationDate, { from: user, value: stakedValue });
    expectThrow(this.jointGrant.attempt(tradePartner, expirationDate, { from: user, value: stakedValue }));
  });

  it("should not allow either user to attempt a grant with the same tradePartner while there is an active grant", async function () {

    const expirationDate = latestTime() + duration.weeks(1);

    // user creates a grant
    const stakedValue = ether(1);
    const response = await this.jointGrant.attempt(tradePartner, expirationDate, { from: user, value: stakedValue });
    const userCost = getCost(response);
    const grantEvent = response.logs[0];

    assert.equal(grantEvent.event, "jointGrantAttempted");

    // tradePartner creates a grant
    const secondStakedValue = ether(2);
    const secondResponse = await this.jointGrant.attempt(user, expirationDate, { from: tradePartner, value: secondStakedValue });
    const tradePartnerCost = getCost(secondResponse);
    const secondGrantEvent = secondResponse.logs[0];

    assert.equal(secondGrantEvent.event, "jointGrantCreated");

    expectThrow(this.jointGrant.attempt(tradePartner, expirationDate, { from: user, value: stakedValue }));
    expectThrow(this.jointGrant.attempt(user, expirationDate, { from: tradePartner, value: secondStakedValue }));
  });

  it("should fail to create joint grant if expiration date does not match", async function () {
    const expirationDate = latestTime() + duration.weeks(1);

    // user creates a grant
    const stakedValue = ether(1);
    const response = await this.jointGrant.attempt(tradePartner, expirationDate, { from: user, value: stakedValue });
    const grantEvent = response.logs[0];

    assert.equal(grantEvent.event, "jointGrantAttempted");

    // tradePartner creates a grant
    const wrongExpirationDate = latestTime() + duration.weeks(2);
    const secondStakedValue = ether(2);
    expectThrow(this.jointGrant.attempt(user, wrongExpirationDate, { from: tradePartner, value: secondStakedValue }));

  });

  it("should allow user to cancel and reclaim stake for an attempted joint grant that has not been created yet", async function () {
    const balanceBefore = web3.eth.getBalance(user);
    const expirationDate = latestTime() + duration.weeks(1);

    // user creates a grant
    const stakedValue = ether(1);
    const response = await this.jointGrant.attempt(tradePartner, expirationDate, { from: user, value: stakedValue });
    responseCost = getCost(response);
    const grantEvent = response.logs[0];

    assert.equal(grantEvent.event, "jointGrantAttempted");

    const cancelResponse = await this.jointGrant.cancel(tradePartner, { from: user });
    const cancelCost = getCost(cancelResponse);
    const cancelEvent = response.logs[0];

    assert.equal(cancelEvent.event, "jointGrantCanceled");
    assert.equal(cancelEvent.args.user, user);
    assert.equal(cancelEvent.args.partner, tradePartner);

    const balanceAfter = web3.eth.getBalance(user);

    balanceAfter.should.be.bignumber.equal(balanceBefore.sub(responseCost).sub(cancelCost));

  });

  it("should fail to create a joint grant if a user attempts and then cancels before the other party attempts", async function () {
    const expirationDate = latestTime() + duration.weeks(1);

    // user creates a grant
    const stakedValue = ether(1);
    await this.jointGrant.grant(tradePartner, expirationDate, { from: user, value: stakedValue });
    await this.jointGrant.cancel(tradePartner, { from: user });

    // tradePartner creates a grant
    const secondStakedValue = ether(2);
    const response = await this.jointGrant.attempt(user, expirationDate, { from: tradePartner, value: secondStakedValue });

    const grantEvent = response.logs[0];

    // this indicates that the canceled grant attempt is no longer valid, otherwise this would have created a joint grant.
    assert.equal(grantEvent.event, "jointGrantAttempted");
  });

  it("should allow users to leave reviews for each other in a joint grant", async function () {
    const expirationDate = latestTime() + duration.weeks(1);

    // user creates a grant
    const stakedValue = ether(1);
    await this.jointGrant.attempt(tradePartner, expirationDate, { from: user, value: stakedValue });

    // tradePartner creates a grant
    const secondStakedValue = ether(2);
    await this.jointGrant.attempt(user, expirationDate, { from: tradePartner, value: secondStakedValue });

    // user tries to review
    const negativeExperience = false;
    const comments = "had a great time.";
    const reviewResponse = await this.jointGrant.review(tradePartner, negativeExperience, comments, { from: user });

    const reviewCreatedEvent = reviewResponse.logs[0];

    assert.equal(reviewCreatedEvent.event, "reviewCreated");
    assert.equal(reviewCreatedEvent.args.reviewer, user);
    assert.equal(reviewCreatedEvent.args.reviewee, tradePartner);
    assert.equal(reviewCreatedEvent.args.negativeExperience, negativeExperience);
    assert.equal(reviewCreatedEvent.args.comments, comments);

    // tradePartner tries to review
    const negativeExperience2 = true;
    const comments2 = "had a bad time.";
    const reviewResponse2 = await this.jointGrant.review(user, negativeExperience2, comments2, { from: tradePartner });

    const reviewCreatedEvent2 = reviewResponse2.logs[0];

    assert.equal(reviewCreatedEvent2.event, "reviewCreated");
    assert.equal(reviewCreatedEvent2.args.reviewer, tradePartner);
    assert.equal(reviewCreatedEvent2.args.reviewee, user);
    assert.equal(reviewCreatedEvent2.args.negativeExperience, negativeExperience2);
    assert.equal(reviewCreatedEvent2.args.comments, comments2);

  });

  it("should fail to allow users to leave reviews for each other if the grant has not been created", async function () {
    const expirationDate = latestTime() + duration.weeks(1);

    // user creates a grant
    const stakedValue = ether(1);
    await this.jointGrant.attempt(tradePartner, expirationDate, { from: user, value: stakedValue });

    // user tries to review
    const negativeExperience = false;
    const comments = "this is a review that was left before the grant was created by both parties.";
    expectThrow(this.jointGrant.review(tradePartner, negativeExperience, comments, { from: user }));

  });


  it("should allow users to reclaim stakes as long as one review is positive", async function () {
    const userBalanceBefore = web3.eth.getBalance(user);
    const partnerBalanceBefore = web3.eth.getBalance(tradePartner);

    const expirationDate = latestTime() + duration.weeks(1);

    // user creates a grant
    const stakedValue = ether(1);
    const userAttemptResponse = await this.jointGrant.attempt(tradePartner, expirationDate, { from: user, value: stakedValue });
    const userAttemptCost = getCost(userAttemptResponse);

    // tradePartner creates a grant
    const secondStakedValue = ether(2);
    const partnerAttemptResponse = await this.jointGrant.attempt(user, expirationDate, { from: tradePartner, value: secondStakedValue });
    const partnerAttemptCost = getCost(partnerAttemptResponse);

    // user reviews positively
    const negativeExperience = false;
    const comments = "had a great time.";
    const userReviewResponse = await this.jointGrant.review(tradePartner, negativeExperience, comments, { from: user });
    const userReviewCost = getCost(userReviewResponse);

    // tradePartner reviews negatively
    const negativeExperience2 = true;
    const comments2 = "had a bad time.";
    const partnerReviewResponse = await this.jointGrant.review(user, negativeExperience2, comments2, { from: tradePartner });
    const partnerReviewCost = getCost(partnerReviewResponse);

    // user try to reclaim stakes
    const userReclaimResponse = await this.jointGrant.reclaimStake(tradePartner, { from: user });
    const userReclaimCost = getCost(userReclaimResponse);

    const ReclaimedEvent = userReclaimResponse.logs[0];

    assert.equal(ReclaimedEvent.event, "StakeReclaimed");
    assert.equal(ReclaimedEvent.args.user, user);
    assert.equal(ReclaimedEvent.args.partner, tradePartner);
    assert.equal(ReclaimedEvent.args.amount, stakedValue);

    // balance should be the same as before minus transaction costs because the stake is reclaimed.
    const expectedUserBalanceAfter = userBalanceBefore.sub(userAttemptCost).sub(userReviewCost).sub(userReclaimCost);
    const userBalanceAfter = web3.eth.getBalance(user);

    assert.equal(expectedUserBalanceAfter, userBalanceAfter);

    // tradepartner try to reclaim stakes
    const partnerReclaimResponse = await this.jointGrant.reclaimStake(user, { from: tradePartner });
    const partnerReclaimCost = getCost(partnerReclaimResponse);

    const ReclaimedEvent2 = partnerReclaimResponse.logs[0];

    assert.equal(ReclaimedEvent2.event, "StakeReclaimed");
    assert.equal(ReclaimedEvent2.args.user, tradePartner);
    assert.equal(ReclaimedEvent2.args.partner, user);
    assert.equal(ReclaimedEvent2.args.amount, secondStakedValue);

    // balance should be the same as before minus transaction costs because the stake is reclaimed.
    const expectedPartnerBalanceAfter = partnerBalanceBefore.sub(partnerAttemptCost).sub(partnerReviewCost).sub(partnerReclaimCost);
    const partnerBalanceAfter = web3.eth.getBalance(tradePartner);

    assert.equal(expectedPartnerBalanceAfter, partnerBalanceAfter);

  });

  it("should treat an expired review as a positive experience if both reviews were not left and allow reclaiming of stakes", async function () {
    const userBalanceBefore = web3.eth.getBalance(user);
    const partnerBalanceBefore = web3.eth.getBalance(tradePartner);

    const expirationDate = latestTime() + duration.weeks(1);

    // user creates a grant
    const stakedValue = ether(1);
    const userGrantResponse = await this.jointGrant.attempt(tradePartner, expirationDate, { from: user, value: stakedValue });
    const userGrantCost = await getCost(userGrantResponse);

    // tradePartner creates a grant
    const secondStakedValue = ether(2);
    const partnerGrantResponse = await this.jointGrant.attempt(user, expirationDate, { from: tradePartner, value: secondStakedValue });
    const partnerGrantCost = await getCost(partnerGrantResponse);

    // expiration with no reviews
    await increaseTimeTo(expirationDate + 1);

    // attempt to reclaim stakes after grant expired
    const userReclaimStakeResponse = await this.jointGrant.reclaimStake(tradePartner, { from: user });
    const userReclaimStakeCost = await getCost(userReclaimStakeResponse);

    // check that the staked value was returned to user.
    const userStakeReclaimed = userReclaimStakeResponse.logs[0];
    assert.equal(userStakeReclaimed.event, "StakeReclaimed");
    assert.equal(userStakeReclaimed.args.user, user);
    assert.equal(userStakeReclaimed.args.partner, tradePartner);
    assert.equal(userStakeReclaimed.args.amount, stakedValue);

    const userBalanceAfter = web3.eth.getBalance(user);
    const expectedUserBalanceAfter = userBalanceBefore.sub(userGrantCost).sub(userReclaimStakeCost);
    userBalanceAfter.should.be.bignumber.equal(expectedUserBalanceAfter);

    // attempt to reclaim stakes after grant expired for partner
    const partnerReclaimStakeResponse = await this.jointGrant.reclaimStake(user, { from: tradePartner });
    const partnerReclaimStakeCost = await getCost(partnerReclaimStakeResponse);

    // check that the staked value was returned to tradePartner.
    const partnerStakeReclaimed = partnerReclaimStakeResponse.logs[0];
    assert.equal(partnerStakeReclaimed.event, "StakeReclaimed");
    assert.equal(partnerStakeReclaimed.args.user, tradePartner);
    assert.equal(partnerStakeReclaimed.args.partner, user);
    assert.equal(partnerStakeReclaimed.args.amount, secondStakedValue);

    const partnerBalanceAfter = web3.eth.getBalance(user);
    const expectedPartnerBalanceAfter = partnerBalanceBefore.sub(partnerGrantCost).sub(partnerReclaimStakeCost);
    partnerBalanceAfter.should.be.bignumber.equal(expectedPartnerBalanceAfter);

  });

  it("should not allow reclaiming of stakes if both reviews have not been left and it has not expired", async function () {
    const expirationDate = latestTime() + duration.weeks(1);

    // user creates a grant
    const stakedValue = ether(1);
    await this.jointGrant.attempt(tradePartner, expirationDate, { from: user, value: stakedValue });

    // tradePartner creates a grant
    const secondStakedValue = ether(2);
    await this.jointGrant.attempt(user, expirationDate, { from: tradePartner, value: secondStakedValue });

    expectThrow(this.jointGrant.reclaimStake(tradePartner, { from: user }));
    expectThrow(this.jointGrant.reclaimStake(user, { from: tradePartner }));

  });

  it("should not allow reclaiming of stakes if only one review has been left and it has not expired", async function () {
    const expirationDate = latestTime() + duration.weeks(1);

    // user creates a grant
    const stakedValue = ether(1);
    await this.jointGrant.attempt(tradePartner, expirationDate, { from: user, value: stakedValue });

    // tradePartner creates a grant
    const secondStakedValue = ether(2);
    await this.jointGrant.attempt(user, expirationDate, { from: tradePartner, value: secondStakedValue });

    // add a single review
    const negativeExperience = false;
    const comments = "it was fine.";
    await this.jointGrant.review(tradePartner, negativeExperience, comments, { from: user });

    // should not allow to reclaim stakes
    expectThrow(this.jointGrant.reclaimStake(tradePartner, { from: user }));
    expectThrow(this.jointGrant.reclaimStake(user, { from: tradePartner }));
  });

  it("should not allow reclaiming of stakes if both reviews are negative", async function () {
    const expirationDate = latestTime() + duration.weeks(1);

    // user creates a grant
    const stakedValue = ether(1);
    await this.jointGrant.attempt(tradePartner, expirationDate, { from: user, value: stakedValue });

    // tradePartner creates a grant
    const secondStakedValue = ether(2);
    await this.jointGrant.attempt(user, expirationDate, { from: tradePartner, value: secondStakedValue });

    // user reviews negatively
    const negativeExperience = true;
    const comments = "it was bad.";
    await this.jointGrant.review(tradePartner, negativeExperience, comments, { from: user });

    // partner reviews negatively
    const negativeExperience2 = true;
    const comments2 = "it was really bad.";
    await this.jointGrant.review(user, negativeExperience2, comments2, { from: tradePartner });

    // should not be able to reclaim
    expectThrow(this.jointGrant.reclaimStake(tradePartner, { from: user }));
    expectThrow(this.jointGrant.reclaimStake(user, { from: tradePartner }));
  });

  it("should allow contract owner to retrieve lost stakes", async function () {
    const ownerBalanceBefore = web3.eth.getBalance(owner);
    const expirationDate = latestTime() + duration.weeks(1);

    // user creates a grant
    const stakedValue = ether(1);
    await this.jointGrant.attempt(tradePartner, expirationDate, { from: user, value: stakedValue });

    // tradePartner creates a grant
    const secondStakedValue = ether(2);
    await this.jointGrant.attempt(user, expirationDate, { from: tradePartner, value: secondStakedValue });

    // user reviews negatively
    const negativeExperience = true;
    const comments = "it was bad.";
    await this.jointGrant.review(tradePartner, negativeExperience, comments, { from: user });

    // partner reviews negatively
    const negativeExperience2 = true;
    const comments2 = "it was really bad.";
    await this.jointGrant.review(user, negativeExperience2, comments2, { from: tradePartner });

    // retrieve lost stakes
    const withdrawResponse = await this.jointGrant.withdrawLostStakes({ from: owner });
    const withdrawCost = getCost(withdrawResponse);
    const lostStakesAmount = stakedValue.add(secondStakedValue);

    const withdrawEvent = withdrawResponse.logs[0];
    assert.equal(withdrawEvent.event, "LostStakesWithdrawn");
    assert.equal(withdrawEvent.args.owner, owner);
    assert.equal(withdrawEvent.args.amount, lostStakesAmount);

    const ownerBalanceAfter = web3.eth.getBalance(owner);
    const expectedOwnerBalanceAfter = ownerBalanceBefore.add(lostStakesAmount).sub(withdrawCost);

    assert.equal(expectedOwnerBalanceAfter, ownerBalanceAfter);
  });

  it("should not allow non-owner to retrieve lost stakes", async function () {
    const expirationDate = latestTime() + duration.weeks(1);

    // user creates a grant
    const stakedValue = ether(1);
    await this.jointGrant.attempt(tradePartner, expirationDate, { from: user, value: stakedValue });

    // tradePartner creates a grant
    const secondStakedValue = ether(2);
    await this.jointGrant.attempt(user, expirationDate, { from: tradePartner, value: secondStakedValue });

    // user reviews negatively
    const negativeExperience = true;
    const comments = "it was bad.";
    await this.jointGrant.review(tradePartner, negativeExperience, comments, { from: user });

    // partner reviews negatively
    const negativeExperience2 = true;
    const comments2 = "it was really bad.";
    await this.jointGrant.review(user, negativeExperience2, comments2, { from: tradePartner });

    expectThrow(this.jointGrant.withdrawLostStakes({ from: randomUser }));

  });


});
