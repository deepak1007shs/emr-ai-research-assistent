# Decision table B2: the unadjusted test, one factor at a time

Decision table B is keyed on the outcome's data type and the shape of the
comparison. That is enough for a trial, where the comparison is the arm and the
arm is one thing. It is not enough for an observational study, where the
question is "which of these factors is the outcome associated with" and the
factors are of different kinds: a duration in hours, a mechanism with two
categories, an anatomical level with several.

The table has no row for "a continuous factor against a binary outcome", so a
study asking exactly that fell through to the nearest row for its outcome type
and reported the phi coefficient - a measure of association between two yes-or-no
variables - for four continuous scores. That is the gap this file closes: the
key carries the factor's data type as well as the outcome's.

One row of the unadjusted screen is drawn per factor, and the whole screen is
hypothesis-generating. It is the univariate look that decides what the adjusted
model can afford to carry, not nine confirmatory tests, and Step 5 says so in
the multiplicity line.

`Key` is `<outcome data type>|<factor data type>`, matched exactly, with `*`
standing for any one part. The first row whose key matches wins, so the specific
rows are above the general ones.

| Key | Situation | Test | Fallback | Short |
| --- | --- | --- | --- | --- |
| binary\|binary | A yes-or-no factor against a yes-or-no outcome | Chi-square test | Fisher's exact test where any expected count is below 5 |  |
| binary\|nominal | An unordered factor against a yes-or-no outcome | Chi-square test across the categories | Fisher's exact test where any expected count is below 5 |  |
| binary\|ordinal | An ordered factor against a yes-or-no outcome | Chi-square test across the ordered categories, with the Cochran-Armitage test for trend | Fisher's exact test where any expected count is below 5 | Chi-square, Cochran-Armitage trend test |
| binary\|continuous | A measured factor against a yes-or-no outcome | Independent t-test | Mann-Whitney test where the factor is skewed |  |
| binary\|count | A counted factor against a yes-or-no outcome | Mann-Whitney test |  |  |
| binary\|time_to_event | A time against a yes-or-no outcome | Mann-Whitney test on the observed times |  |  |
| continuous\|binary | A yes-or-no factor against a measured outcome | Independent t-test | Mann-Whitney test where the outcome is skewed |  |
| continuous\|nominal | An unordered factor against a measured outcome | One-way analysis of variance | Kruskal-Wallis test where the outcome is skewed |  |
| continuous\|ordinal | An ordered factor against a measured outcome | Spearman rank correlation with a 95% confidence interval |  | Spearman correlation |
| continuous\|continuous | A measured factor against a measured outcome | Pearson correlation with a 95% confidence interval | Spearman correlation where either is skewed | Pearson correlation |
| continuous\|count | A counted factor against a measured outcome | Spearman rank correlation with a 95% confidence interval |  | Spearman correlation |
| ordinal\|binary | A yes-or-no factor against an ordered outcome | Mann-Whitney test |  |  |
| ordinal\|nominal | An unordered factor against an ordered outcome | Kruskal-Wallis test |  |  |
| ordinal\|ordinal | An ordered factor against an ordered outcome | Spearman rank correlation with a 95% confidence interval |  | Spearman correlation |
| ordinal\|continuous | A measured factor against an ordered outcome | Spearman rank correlation with a 95% confidence interval |  | Spearman correlation |
| count\|binary | A yes-or-no factor against a counted outcome | Mann-Whitney test |  |  |
| count\|continuous | A measured factor against a counted outcome | Spearman rank correlation with a 95% confidence interval |  | Spearman correlation |
| nominal\|* | Any factor against an unordered outcome | Chi-square test | Fisher's exact test where any expected count is below 5 |  |
| time_to_event\|binary | A yes-or-no factor against a time to event | Log-rank test |  |  |
| time_to_event\|nominal | An unordered factor against a time to event | Log-rank test across the categories |  |  |
| time_to_event\|ordinal | An ordered factor against a time to event | Log-rank test for trend across the ordered categories |  | Log-rank test for trend |
| time_to_event\|continuous | A measured factor against a time to event | Univariable Cox regression, with the factor entered as it is measured |  | Univariable Cox regression |
| *\|* | A factor whose pairing the table does not name | Chi-square test for categories, or the Mann-Whitney test where either side is measured |  | Chi-square or Mann-Whitney test |

The last row is a stated fallback rather than a silent one: it is reported as an
open item, because a pairing this table does not name is a pairing somebody
should look at before the data arrive.
