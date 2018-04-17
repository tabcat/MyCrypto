/// <reference types="Cypress" />
const visitBetaBanner = () => {
  cy.visit('');
  getDataCy('BetaAgreement').should('be.visible');
};
//node_modules/cypress/dist/Cypress/resources/app/packages/launcher
//chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn/popup.html
const getDataCy = str => cy.get(`[data-cy=${str}]`);

describe('User first visiting', () => {
  it('should display the beta banner', () => {
    visitBetaBanner();
  });
  it('should redirect the user to mycrypto on beta agreement rejection', () => {
    visitBetaBanner();
    cy.get('[data-cy=BetaAgreement-Reject]').click();
    cy.url().should('eq', 'https://mycrypto.com/');
  });
  it('should let the user proceed to the beta site on accept', () => {
    visitBetaBanner();
    cy.get('[data-cy=BetaAgreement-Accept]').click();
  });
  it('should load the onboarding modal', () => {
    getDataCy('Modal')
      .contains('Next')
      .click()
      .click()
      .click()
      .click()
      .click()
      .click()
      .click()
      .click()
      .click();
  });
  it('should finish the onboarding modal', () => {
    getDataCy('Modal')
      .contains('Done')
      .click();
  });
  it('should present only the onboard modal on reload', () => {
    window.localStorage.setItem('acknowledged-beta', true);
    cy.reload();
    cy.contains('Welcome to MyCrypto.com');
  });

  it('should present the user the regular load page', () => {
    window.localStorage.setItem('acknowledged-beta', true);
    window.localStorage.setItem('onboardStatus', 10);
    cy.reload();

    cy.contains('Ledger').click();
  });
});
