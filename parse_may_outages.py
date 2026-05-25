import pandas as pd
import json

df = pd.read_excel('Plants on Outage in Luzon and Visayas grids on 12-18 May 2026(1).xlsx', sheet_name=0, header=2)
print(df[['Actual Outage Occurrence', 'Actual Outage Resumption', 'Estimated Resumption']].dropna(how='all').head(10))
