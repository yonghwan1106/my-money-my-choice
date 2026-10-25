# -*- coding: utf-8 -*-
"""Signal firing statistics on the VALIDATION split only (for the one-time
signal tuning, pipeline/signals_tuning.md). Never reads test rows.

Usage: python <repo>/pipeline/signal_stats.py <features.csv> <fired.csv>
"""
import sys

import pandas as pd

SIG = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10"]


def main():
    f = pd.read_csv(sys.argv[1])
    g = pd.read_csv(sys.argv[2])
    d = f.merge(g, on=["person_id", "week"])
    d = d[(d["split"] == "val") & (d["level_insufficient"] == 0)]
    none = d[d["cohort"] == "none"]
    pos = d[d["label"] == 1]
    months_none = len(none) * 7 / 30.44
    print("val windows=%d none_windows=%d pos_windows=%d" % (len(d), len(none), len(pos)))
    print("%-4s %12s %10s %10s" % ("sig", "none/month", "pos_rate", "neg_rate"))
    neg = d[d["label"] == 0]
    for s in SIG:
        print("%-4s %12.3f %10.3f %10.3f" % (s, none[s].sum() / max(1, len(none["person_id"].unique())) /
                                           (months_none / max(1, len(none["person_id"].unique()))),
                                           pos[s].mean(), neg[s].mean()))
    for name, sub in (("none_plain", none[none["person_id"].isin(none["person_id"])]),):
        pass
    b3 = d["b3"]
    print("B3>=1 none cards/month %.3f  recall(pos windows) %.3f" %
          ((none["b3"] >= 1).sum() / months_none, (pos["b3"] >= 1).mean()))
    print("B3>=2 none cards/month %.3f  recall %.3f" % ((none["b3"] >= 2).sum() / months_none, (pos["b3"] >= 2).mean()))
    by = pos.groupby("pattern")[SIG].mean().round(2)
    print(by.to_string())


if __name__ == "__main__":
    main()
