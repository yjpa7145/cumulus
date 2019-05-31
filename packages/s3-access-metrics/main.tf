locals {
  metric_generator_function_name = "${var.prefix}-metric-generator"
  deploy_to_vpc                  = var.vpc_id != "" && length(var.subnet_ids) > 0
}

data "aws_caller_identity" "current" {}

resource "aws_security_group" "lambda_security_group" {
  count  = local.deploy_to_vpc ? 1 : 0
  vpc_id = "${var.vpc_id}"
}

data "aws_iam_policy_document" "assume_lambda_role" {
  statement {
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
    actions = ["sts:AssumeRole"]
  }
}

resource "aws_iam_role" "lambda_role" {
  assume_role_policy   = "${data.aws_iam_policy_document.assume_lambda_role.json}"
  permissions_boundary = "${var.permissions_boundary}"
}

data "aws_iam_policy_document" "lambda_role_policy" {
  statement {
    actions = [
      "ec2:CreateNetworkInterface",
      "ec2:DescribeNetworkInterfaces",
      "ec2:DeleteNetworkInterface"
    ]
    resources = ["*"]
  }
  statement {
    actions   = ["cloudwatch:PutMetricData"]
    resources = ["*"]
  }
  statement {
    actions   = ["s3:GetObject"]
    resources = ["arn:aws:s3:::${var.logs_bucket}/${var.logs_prefix}*"]
  }
  statement {
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents"
    ]
    resources = ["arn:aws:logs:${var.region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/*:*:*"]
  }
}

resource "aws_iam_role_policy" "lambda_role_policy" {
  role   = "${aws_iam_role.lambda_role.id}"
  policy = "${data.aws_iam_policy_document.lambda_role_policy.json}"
}

resource "aws_cloudwatch_log_group" "metric_generator_log_group" {
  name = "/aws/lambda/${local.metric_generator_function_name}"
}

resource "aws_lambda_function" "metric_generator" {
  # TODO Build this package somehow
  filename         = "${path.module}/dist/package.zip"
  source_code_hash = "${filebase64sha256("${path.module}/dist/package.zip")}"
  function_name    = local.metric_generator_function_name
  handler          = "index.handler"
  role             = aws_iam_role.lambda_role.arn
  runtime          = "nodejs8.10"
  vpc_config {
    subnet_ids         = local.deploy_to_vpc ? var.subnet_ids : []
    security_group_ids = local.deploy_to_vpc ? [aws_security_group.lambda_security_group[0].id] : []
  }
  environment {
    variables = {
      stack = "${var.stack}"
    }
  }
  depends_on = ["aws_cloudwatch_log_group.metric_generator_log_group"]
}

resource "aws_lambda_permission" "allow_bucket" {
  statement_id  = "AllowExecutionFromS3Bucket"
  action        = "lambda:InvokeFunction"
  function_name = "${aws_lambda_function.metric_generator.arn}"
  principal     = "s3.amazonaws.com"
  source_arn    = "arn:aws:s3:::${var.logs_bucket}"
}

resource "aws_s3_bucket_notification" "log_notification" {
  bucket = "${var.logs_bucket}"
  lambda_function {
    lambda_function_arn = "${aws_lambda_function.metric_generator.arn}"
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "${var.logs_prefix}"
  }
  depends_on = ["aws_lambda_permission.allow_bucket"]
}
