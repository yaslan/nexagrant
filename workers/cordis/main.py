from fastapi import FastAPI, BackgroundTasks
import duckdb
import pandas as pd
import networkx as nx
import psycopg2
from psycopg2.extras import execute_values
import os
import uuid
import datetime

app = FastAPI(title="Fabrika CORDIS Worker")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/fabrika")

def run_cordis_pipeline():
    print("Starting CORDIS pipeline...")
    
    # 1. Download & DuckDB (Mock data generation for MVP)
    # Normally we would download CSVs from CORDIS, but here we construct a DataFrame
    print("Step 1: Downloading & cleaning with DuckDB")
    
    org_data = [
        {"id": "999999999", "name": "MOCK UNIVERSITY", "shortName": "MU", "country": "UK", "activityType": "HES", "isSme": False},
        {"id": "888888888", "name": "TECH SME CORP", "shortName": "TECH", "country": "FR", "activityType": "PRC", "isSme": True},
        {"id": "777777777", "name": "GOV RESEARCH", "shortName": "GOV", "country": "DE", "activityType": "REC", "isSme": False},
    ]
    
    project_data = [
        {"id": "PROJ-001", "acronym": "AI-CLIMATE", "title": "AI for Climate", "framework": "HE", "topicCode": "HORIZON-CL5-2026-09-D4-01"},
        {"id": "PROJ-002", "acronym": "QUANTUM-SME", "title": "Quantum for SME", "framework": "HE", "topicCode": "HORIZON-CL4-2026-01-01"},
    ]
    
    part_data = [
        {"projectId": "PROJ-001", "organizationId": "999999999", "role": "coordinator", "ecContributionCents": 100000000},
        {"projectId": "PROJ-001", "organizationId": "888888888", "role": "participant", "ecContributionCents": 50000000},
        {"projectId": "PROJ-002", "organizationId": "888888888", "role": "coordinator", "ecContributionCents": 80000000},
        {"projectId": "PROJ-002", "organizationId": "777777777", "role": "participant", "ecContributionCents": 70000000},
    ]
    
    # Use DuckDB to do some transformation (demonstrating the requirement)
    df_orgs = pd.DataFrame(org_data)
    df_projs = pd.DataFrame(project_data)
    df_parts = pd.DataFrame(part_data)
    
    con = duckdb.connect()
    con.register('orgs', df_orgs)
    con.register('parts', df_parts)
    
    # Calculate participation count and ecContributionSum via DuckDB
    agg_df = con.execute("""
        SELECT 
            organizationId as id,
            COUNT(*) as participationCount,
            SUM(CASE WHEN role='coordinator' THEN 1 ELSE 0 END) as coordinatorCount,
            SUM(ecContributionCents) as ecContributionSum
        FROM parts
        GROUP BY organizationId
    """).df()
    
    # Merge aggregations back
    df_orgs = df_orgs.merge(agg_df, on="id", how="left").fillna(0)
    
    # 2. NetworkX Derived Metrics
    print("Step 2: Calculating NetworkX metrics")
    G = nx.Graph()
    # Add edges between organizations collaborating in the same project
    for proj_id, group in df_parts.groupby('projectId'):
        orgs_in_proj = group['organizationId'].tolist()
        for i in range(len(orgs_in_proj)):
            for j in range(i + 1, len(orgs_in_proj)):
                G.add_edge(orgs_in_proj[i], orgs_in_proj[j])
    
    degree_dict = dict(G.degree())
    try:
        eigen_dict = nx.eigenvector_centrality(G, max_iter=1000)
    except:
        eigen_dict = {n: 0 for n in G.nodes()}
        
    df_orgs['degree'] = df_orgs['id'].map(degree_dict).fillna(0)
    df_orgs['eigenvector'] = df_orgs['id'].map(eigen_dict).fillna(0)
    
    # 3. Upsert to Postgres using COPY/psycopg2
    print("Step 3: Upserting to PostgreSQL")
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        
        # Upsert Orgs
        org_tuples = [
            (
                row['id'], row['name'], row['shortName'], row['country'], row['activityType'], 
                bool(row['isSme']), int(row['coordinatorCount']), int(row['participationCount']), 
                int(row['ecContributionSum']), int(row['degree']), float(row['eigenvector']),
                datetime.datetime.now()
            ) for _, row in df_orgs.iterrows()
        ]
        
        execute_values(cursor, """
            INSERT INTO "Organization" (
                id, name, "shortName", country, "activityType", "isSme", 
                "coordinatorCount", "participationCount", "ecContributionSum", degree, eigenvector, "updatedAt"
            ) VALUES %s
            ON CONFLICT (id) DO UPDATE SET
                "coordinatorCount" = EXCLUDED."coordinatorCount",
                "participationCount" = EXCLUDED."participationCount",
                "ecContributionSum" = EXCLUDED."ecContributionSum",
                degree = EXCLUDED.degree,
                eigenvector = EXCLUDED.eigenvector,
                "updatedAt" = EXCLUDED."updatedAt";
        """, org_tuples)
        
        # Upsert Projects
        proj_tuples = [
            (row['id'], row['acronym'], row['title'], row['framework'], row['topicCode'])
            for _, row in df_projs.iterrows()
        ]
        
        execute_values(cursor, """
            INSERT INTO "Project" (id, acronym, title, framework, "topicCode")
            VALUES %s
            ON CONFLICT (id) DO NOTHING;
        """, proj_tuples)
        
        # Upsert Participations
        part_tuples = [
            (str(uuid.uuid4()), row['projectId'], row['organizationId'], row['role'], int(row['ecContributionCents']))
            for _, row in df_parts.iterrows()
        ]
        
        execute_values(cursor, """
            INSERT INTO "Participation" (id, "projectId", "organizationId", role, "ecContributionCents")
            VALUES %s
            ON CONFLICT ("projectId", "organizationId", role) DO UPDATE SET
                "ecContributionCents" = EXCLUDED."ecContributionCents";
        """, part_tuples)
        
        conn.commit()
        cursor.close()
        conn.close()
        print("Pipeline finished successfully.")
    except Exception as e:
        print(f"Error connecting or querying database: {e}")

@app.post("/jobs/cordis")
async def trigger_cordis(background_tasks: BackgroundTasks):
    # Trigger the heavy task in the background
    background_tasks.add_task(run_cordis_pipeline)
    return {"message": "CORDIS pipeline triggered"}

@app.get("/health")
async def health_check():
    return {"status": "ok"}

if __name__ == "__main__":
    run_cordis_pipeline()
