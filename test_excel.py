import pandas as pd

df = pd.read_excel('Plants on Outage in Luzon and Visayas grids on 12-18 May 2026(1).xlsx', sheet_name=0)
print(df.head())
print(df.columns)
