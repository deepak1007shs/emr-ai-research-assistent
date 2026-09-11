# Decision table C: the model a binary outcome owes, by how common the event is

"Logistic regression" on its own is an incomplete row. The row must say how
common the outcome is expected to be, what effect measure that implies, which
model is fitted first, and what is fitted instead when it fails.

The expected frequency is a number from the protocol. Where the protocol does
not give one it is a question for the investigator, never a guess, and the row
says so.

`Key` is matched by code in the order written here.

| Key | Situation | Effect measure | Model | Named fallback |
|---|---|---|---|---|
| unknown | The expected frequency is not stated | Risk ratio | Log-binomial regression, planned on the assumption that the outcome is common | Modified Poisson regression with robust variance |
| separation | A group with every event, or none | Risk ratio | Firth penalised likelihood | |
| clustered | Readings repeat within a person or a cluster | Risk ratio | Log-binomial regression with robust (sandwich) variance clustered on the person | Modified Poisson regression with robust variance |
| common | The outcome is expected in 10% or more | Risk ratio | Log-binomial regression | Modified Poisson regression with robust variance, where the log link does not converge |
| rare | The outcome is expected in fewer than 10% | Odds ratio, which approximates the risk ratio at this frequency | Logistic regression | Firth penalised likelihood where the model separates |
