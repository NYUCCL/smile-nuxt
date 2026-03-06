// this is a test file for checking the prolific workflow

// There's a principle here where we don't need to test the prolific's website
// works correctly (although we could).  We get to assume that is right.  So
// what we test here simply is that if a user comes into the task in a way consistent
// with being in a prolifict experiment referral then check that when they exit that
// task they will be redicted to the prolific website correctly.
describe('test that the project will run successfully on prolific', () => {
  it('should provide a properly formatted prolific end point when it starts in prolific mode', () => {
    cy.viewport(1000, 1200) // cy.viewport('iphone-11)

    // visit the page
    cy.visit(`${Cypress.env('VITE_DEPLOY_URL')}#/welcome/prolific/?PROLIFIC_PID=xxxxx&STUDY_ID=xxxxxx&SESSION_ID=xxxxx`)
    cy.visit(`${Cypress.env('VITE_DEPLOY_URL')}#/debrief/`) // dev mode allows jumping paths like this
    cy.contains('next').click()
    cy.get('.payment').get('.has-text-left').contains('Prolific') // assert this is the right endpoint text

    cy.get('.payment')
      .find('a')
      .should('have.attr', 'href')
      .and('include', 'https://app.prolific.co/submissions/complete?cc=') // assert this is the right endpoint url

    // seems ok then
  })
})
