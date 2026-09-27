## MODIFIED Requirements

### Requirement: Atomic safe inventory reconciliation
The system SHALL reconcile a node's discovered clients only from a complete response that passes the pinned wg-easy 15.4.0 information and client schemas, SHALL identify each client by node and numeric remote identifier, SHALL update the node's last-successful-sync timestamp in the same transaction, and SHALL classify linked placements against durable desired state without overwriting complete intent.

#### Scenario: Successful complete synchronization
- **WHEN** a node returns a valid supported information response and complete client list
- **THEN** every returned client is upserted as a safe public snapshot, previously known absent clients are marked missing, linked placements are classified active, drift, or missing, and the node receives the successful UTC sync timestamp atomically

#### Scenario: Same client name on two nodes
- **WHEN** two nodes return clients with the same display name
- **THEN** the inventory retains two independent records keyed by their respective node and remote identifier

#### Scenario: Client returns after being missing
- **WHEN** a later successful inventory includes a previously missing node-and-remote-identifier pair
- **THEN** the existing record is refreshed, its missing marker is cleared without changing its first-seen timestamp, and its linked placement is reclassified from current state

#### Scenario: Complete desired state differs
- **WHEN** a linked current remote snapshot differs from its complete durable desired update state
- **THEN** the placement becomes drift and the desired payload remains unchanged

