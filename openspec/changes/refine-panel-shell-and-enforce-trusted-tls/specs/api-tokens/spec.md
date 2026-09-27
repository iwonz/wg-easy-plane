## MODIFIED Requirements

### Requirement: Panel token management
The authenticated panel SHALL open localized token management from the avatar menu in a large modal, SHALL load token metadata only when that modal opens, and SHALL use stacked modal confirmations for creation and revocation. The workflow SHALL let the administrator list token metadata, create tokens from the fixed scope vocabulary, copy a newly issued secret, dismiss it permanently from UI state, and revoke existing tokens without locale-prefixed routes. Closing the management modal SHALL clear the one-time secret and every transient create or revoke state.

#### Scenario: Open token management
- **WHEN** the administrator selects the token action from the avatar menu
- **THEN** the large token management modal opens and begins loading token metadata

#### Scenario: Token management remains closed
- **WHEN** the authenticated panel loads and the administrator does not open token management
- **THEN** the browser does not request token metadata

#### Scenario: Create token in the panel
- **WHEN** the administrator creates a token from the stacked creation modal
- **THEN** the complete secret is shown in a one-time warning view and is not shown again after dismissal, modal closure, or reload

#### Scenario: Revoke token in the panel
- **WHEN** the administrator confirms revocation in the stacked confirmation modal
- **THEN** the token is marked revoked in the localized list and can no longer authenticate

#### Scenario: Close token management with transient state
- **WHEN** the administrator closes token management while a one-time secret or incomplete create or revoke action is present
- **THEN** all such transient UI state is cleared before the workflow can be opened again
