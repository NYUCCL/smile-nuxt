// this is a test file for checking the cloud research workflow

// There's a principle here where we don't need to test cloudresearch's website
// works correctly (although we could).  We get to assume that is right.  So
// what we test here simply is that if a user comes into the task in a way consistent
// with being in a cloudresearch experiment referral then check that when they exit that
// task they will be asked to copy paste the code into the mechanical turk website.
describe('test that the project will run successfully on cloudresearch', () => {
  it('should provide a properly formatted cloudresearch end point when it starts in cloudresearch mode', () => {
    cy.viewport(1000, 1200) // cy.viewport('iphone-11)

    // visit the page
    cy.visit(
      `${Cypress.env(
        'VITE_DEPLOY_URL'
      )}#/welcome/cloudresearch/?assignmentId=123RVWYBAZW00EXAMPLE456RVWYBAZW00EXAMPLE&hitId=123RVWYBAZW00EXAMPLE&turkSubmitTo=https://www.mturk.com/&workerId=AZ3456EXAMPLE`
    )
    // this should be #/cloudresearch/??assignmentId=123RVWYBAZW00EXAMPLE456RVWYBAZW00EXAMPLE&hitId=123RVWYBAZW00EXAMPLE&turkSubmitTo=https://www.mturk.com/&workerId=AZ3456EXAMPLE
    // if running against a live deployment
    cy.visit(`${Cypress.env('VITE_DEPLOY_URL')}#/debrief/`) // dev mode allows jumping paths like this
    cy.contains('next').click()
    cy.get('.payment').get('.has-text-left').contains('Mechanical Turk') // assert this is the right endpoint text
    cy.contains('Copy Code').click()
    cy.get('.completioncode')
      .invoke('text')
      .then((text) => {
        expect(text.length).to.be.at.least(20)
      })
    // watch this on testing the clipboard: https://www.youtube.com/watch?v=4eEc3x24D64
    // cy.window()
    //   .its('navigator.clipboard')
    //   .invoke('readText')
    //   .should('equal', 'hi')

    // seems ok then
  })
})
