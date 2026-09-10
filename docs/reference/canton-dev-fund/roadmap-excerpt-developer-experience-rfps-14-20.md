### Developer Experience, Tooling & Education

14. Wallet and dApp Integration tooling
    1. RFP
       1. Wallets are a primary interface for users, hosted parties, application providers, and institutional workflows on Canton. The Development Fund is interested in proposals that improve wallet integration tooling, reusable wallet components, signing flows, account/party management, and application-to-wallet interactions.
       2. We anticipate approving multiple grants in this area as work progresses over the coming year. 
    2. Prior Examples:
       1. [2026-02-Cayvox ](https://github.com/canton-foundation/canton-dev-fund/blob/main/proposals/2026-02-Cayvox%20Labs-PartyLayer-Wallet-SDK.md)[Labs-PartyLayer-Wallet-SDK.md](http://labs-partylayer-wallet-sdk.md)
       2. [2026-03-DA-Canton-Network-dapp-sdk-and-tooling.md](https://github.com/canton-foundation/canton-dev-fund/blob/main/proposals/2026-03-DA-Canton-Network-dapp-sdk-and-tooling.md) 
       3. [2026-03-DA-splice-wallet-kernel-open-source.md](https://github.com/canton-foundation/canton-dev-fund/blob/main/proposals/2026-03-DA-splice-wallet-kernel-open-source.md)
15. Canton 3.x Training and Documentation
    1. RFP
       1. Create practical, developer-facing documentation, onboarding kits, training materials, and examples that reduce the time required for new teams to build on Canton. Proposals should focus on reusable public materials that help application developers, validator operators, Featured App teams, and institutional integrators understand how to design, build, test, deploy, and operate Canton applications. Proposals may include quickstart guides, reference architectures, deployment checklists, sample applications, troubleshooting guides, recorded training, workshops, exercises, and onboarding material for validators, application developers, and Featured App teams.
       2. We anticipate approving multiple grants in this area as work progresses over the coming year. Our recommendation for this RFP is small, incremental proposals to enhance existing training materials. 
    2. Prior Examples:
       1. [2026-02-Obsidian-daml-training-proposal-v4.md](https://github.com/canton-foundation/canton-dev-fund/blob/main/proposals/2026-02-Obsidian-daml-training-proposal-v4.md) 
16. Daml / Developer Usability Gaps (Daml U256 Support)
    1. RFP:
       1. The Development Fund is interested in proposals to close usability gaps in Daml, including support for unsigned 256-bit integer workflows commonly needed in token, DeFi, and digital asset applications, as well as native bytes type support. 
       2. This is a specialized RFP that will require deep Daml expertise. It may be suitable for experienced teams with sufficient language, compiler, or financial application development background.
17. SDKs in different languages (standard)
    1. RFP
       1. The Development Fund is interested in proposals to develop, extend and maintain SDKs or client libraries in programming languages commonly used by application developers, financial institutions, and infrastructure providers. Proposals should follow the ledger client standard ([https://docs.google.com/spreadsheets/d/1iR3GqKx6ktqqBiNIwRhoOuzOh0jf\_7H-pQ7QRGOLl9s/edit?gid=541890420#gid=541890420](https://docs.google.com/spreadsheets/d/1iR3GqKx6ktqqBiNIwRhoOuzOh0jf_7H-pQ7QRGOLl9s/edit?gid=541890420#gid=541890420); the standard is going to move into the docs) common interface standards where possible and should include documentation, examples, tests, versioning practices, and a maintenance plan. SDKs should make it easier for developers to interact with Canton APIs, wallets, validators, application services, and network tooling without needing to build low-level integrations from scratch. 
       2. The number of proposals will depend on the number submitted with each needing to identify the target language, the intended developer audience, the APIs or workflows covered, and how compatibility will be maintained as Canton evolves.
       3. Currently supported languages and existing kits are: Java, Typescript, Go, C#, Rust, Python (but more work is required to align them with the ledger client standard).
       4. Not yet known fully featured SDK: C++, Scala
       5. Prior examples: 
          1. [https://github.com/canton-foundation/canton-dev-fund/pull/407](https://github.com/canton-foundation/canton-dev-fund/pull/407) 
          2. [https://docs.canton.network/sdks-tools/api-reference/json-api](https://docs.canton.network/sdks-tools/api-reference/json-api) 
18. Integration into SDLCs
    1. RFP
       1. Build tooling that helps teams integrate Canton development into existing software development lifecycles, including CI/CD pipelines, testing frameworks, deployment workflows, package vetting, environment management, and release automation.
19. DPM Components and Extension Ecosystem
    1. RFP
       1. Proposals that extend DPM as a standard CLI for Canton smart contract development by creating reusable DPM components for the broader developer community. Proposals may include custom project templates, scaffolding tools, deployment helpers, testing utilities, fee estimators, local dashboards, package registry integrations, debugging workflows, observability tools, or other first-class extensions that make it easier to build, test, deploy, and maintain Canton applications. Successful proposals should follow DPM component conventions, be broadly reusable, include documentation and examples, and include a clear maintenance plan.
    2. Prior examples:
       1. No prior grant examples. However, the Foundation DevRel team has compiled a list of suggestions for this area: 
          1. [\[External\] DPM Plugin & Component Use Cases](https://docs.google.com/document/d/1TCkM0Cq4bxIct55wvfZLmr720yhiUCXskN3AKX99lcY/edit?usp=sharing)
20. Indexers
    1. RFP
       1. Indexers and observability tools are essential for application development, debugging, reporting, auditability, and network analytics. The Development Fund is interested in proposals that improve both node-local, application-level, and network-wide visibility while preserving Canton’s privacy boundaries. Proposals may include node-local indexers, application-level indexers, debugging tools, observability dashboards, network activity reporting, and deployable on-premise or hosted visibility tools. Proposals should not assume that all information currently available from protocol messages will remain publicly exposed. Publicly observable activity, such as certain Canton Coin transfers, may remain available, but the metadata currently exposed through the Mediator may change. Applicants should therefore clearly identify:
          1. Which data their proposal requires
          2. Whether that data is node-local, application-provided, or publicly observable
          3. How the proposal will continue to function if involved-party metadata is no longer publicly available
          4. How privacy, access controls, and selective disclosure will be handled
       2. Preference will be given to approaches that do not depend on unintended protocol-level metadata exposure and that remain useful as Canton’s privacy protections evolve.
       3. We have not yet determined how many grants may be approved in this area
    2. Node-local
       1. Prior Examples:
          1. [2026-03-DA-OSS-validator-indexer-pqs.md](https://github.com/canton-foundation/canton-dev-fund/blob/main/proposals/2026-03-DA-OSS-validator-indexer-pqs.md) 
    3. Network-wide
*Note: The* [*Canton Foundation Q2 DevRel Survey*](https://docs.google.com/document/d/1IQybhCKoM1NRecLp2ei1WjmDwJ9Js5n74uPAljP1xnU/edit?usp=sharing) *highlighted the following two areas for improvement:*

- Transaction simulation / dry-run tooling (Tenderly-equivalent) was requested by Q1 respondents and reappears in Q2 as a repeated ask, the debugging/observability gap looks like the longest-standing unmet need in the dataset.

- Transaction Debugging & Observability was the lowest-rated area in Q1 at 2.55 and remained tied for lowest in Q2 at 3.26. Although the score improved, it continued to rank below the other experience areas in both quarters.

### Security, Assurance & Incident Readiness
