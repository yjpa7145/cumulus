resource "aws_instance" "test" {
  ami                    = "ami-0ff8a91507f77f867"
  instance_type          = "t2.micro"
  subnet_id              = var.subnet_id
  vpc_security_group_ids = [var.sg_id]
}
