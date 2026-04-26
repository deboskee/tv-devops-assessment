// =============================================================================
// Route53 & ACM Construct
// =============================================================================
// Creates DNS records and SSL certificate for HTTPS
// =============================================================================

import { Construct } from 'constructs';
import { Route53Record } from '@cdktf/provider-aws/lib/route53-record';
import { AcmCertificate } from '@cdktf/provider-aws/lib/acm-certificate';
import { AcmCertificateValidation } from '@cdktf/provider-aws/lib/acm-certificate-validation';
import { DataAwsRoute53Zone } from '@cdktf/provider-aws/lib/data-aws-route53-zone';
import { AppConfig } from '../config';

export interface Route53ConstructOutputs {
  certificateArn?: string;
  domainName?: string;
}

export class Route53Construct extends Construct {
  public readonly outputs: Route53ConstructOutputs;

  constructor(
    scope: Construct,
    id: string,
    config: AppConfig,
    albDnsName: string,
    albZoneId: string
  ) {
    super(scope, id);

    this.outputs = {};

    if (!config.domain?.name || !config.domain.hostedZoneId) {
      return;
    }

    // Data source for hosted zone
    const hostedZone = new DataAwsRoute53Zone(this, 'zone', {
      zoneId: config.domain.hostedZoneId
    });

    // Subdomain based on environment
    const subdomain = config.environment === 'prod' 
      ? config.domain.name 
      : `${config.environment}.${config.domain.name}`;

    // A record pointing to ALB
    new Route53Record(this, 'a-record', {
      zoneId: hostedZone.zoneId,
      name: subdomain,
      type: 'A',
      alias: {
        name: albDnsName,
        zoneId: albZoneId,
        evaluateTargetHealth: true
      }
    });

    // Create certificate if HTTPS is enabled
    if (config.domain.enableHttps) {
      const certificate = new AcmCertificate(this, 'cert', {
        domainName: subdomain,
        validationMethod: 'DNS',
        subjectAlternativeNames: config.environment === 'prod' 
          ? [`www.${subdomain}`]
          : undefined,
        lifecycle: {
          createBeforeDestroy: true
        },
        tags: {
          ...config.tags,
          Name: `${subdomain}-cert`
        }
      });

      // DNS validation record
      const validationRecord = new Route53Record(this, 'cert-validation', {
        zoneId: hostedZone.zoneId,
        name: certificate.domainValidationOptions.get(0).resourceRecordName,
        type: certificate.domainValidationOptions.get(0).resourceRecordType,
        records: [certificate.domainValidationOptions.get(0).resourceRecordValue],
        ttl: 60,
        allowOverwrite: true
      });

      // Certificate validation
      new AcmCertificateValidation(this, 'cert-validation-complete', {
        certificateArn: certificate.arn,
        validationRecordFqdns: [validationRecord.fqdn]
      });

      this.outputs.certificateArn = certificate.arn;
      this.outputs.domainName = subdomain;
    }
  }
}
